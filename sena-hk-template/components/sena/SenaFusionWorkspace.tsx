"use client";

import Link from "next/link";
import type { ChangeEvent, ElementType, ReactNode, SVGProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Binary,
  Braces,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  GitMerge,
  Home,
  Info,
  LogOut,
  Maximize2,
  Minimize2,
  Network,
  Orbit,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  UsersRound,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import {
  lessonStudySenaContract,
  lessonStudySampleUrl,
  senaPilotAssetIntegrity,
  senaPilotHandoffChecks,
  senaPilotPackageManifestAsset,
  senaPilotSampleAssets,
  senaPilotTemplateAssets
} from "@/lib/sena/pilot-assets";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type { SenaReliabilityDashboard } from "@/lib/sena/reliability";
import {
  buildSenaActiveWindowBrief,
  buildSenaDataContractAudit,
  buildSenaCodingReliabilityGate,
  buildSenaMarkdownReport,
  buildSenaDemoVerificationCompatibilityAudit,
  buildSenaDemoVerification,
  buildSenaDemoWalkthrough,
  buildSenaDevelopmentPlan,
  buildSenaDatasetFromTables,
  buildSenaEvidenceLedger,
  buildSenaEnaManifest,
  buildSenaEnaReportArtifact,
  buildSenaEnaSpaceCoordinateMap,
  buildSenaFusionMathAudit,
  buildSenaClaimReadinessGate,
  buildSenaMethodProtocol,
  buildSenaMetricProvenanceArtifact,
  buildSenaModel,
  buildSenaPairContributionReportArtifact,
  buildSenaProjectSnapshot,
  buildSenaProductionPageContract,
  buildSenaReport,
  buildSenaReportCompletenessAudit,
  buildSenaReviewPacket,
  buildSenaRuntimeBundle,
  buildSenaRuntimeConsistencyAudit,
  buildSenaJenaConceptPairHandoffRows,
  buildSenaJsnaSocialTieHandoffRows,
  buildSenaPilotReadinessAudit,
  buildSenaSnaReportArtifact,
  buildSenaSnaManifest,
  buildSenaTemporalRuntimeTrace,
  buildSenaValidation,
  buildSenaVisualGrammarArtifact,
  createEmptySenaDataset,
  importSenaJsonContract,
  importSenaDemoVerification,
  importSenaProjectSnapshot,
  importSenaReviewPacket,
  inferSenaColumnMapping,
  inferSenaTableFromName,
  missingRequiredSenaFields,
  parseSenaCsv,
  senaImportFields,
  senaImportTables,
  scopeSenaDatasetToWindow,
  type SenaDataContractAudit,
  type SenaDataGovernanceMetadata,
  type SenaActiveWindowBrief,
  type SenaClaimReadinessGate,
  type SenaCodingReliabilityGate,
  type SenaCodingReliabilityReview,
  type SenaDemoVerification,
  type SenaDemoVerificationCompatibilityAudit,
  type SenaDemoVerificationCheck,
  type SenaDevelopmentPlan,
  type SenaImportTable,
  type SenaMappedTable,
  type SenaEdge,
  type SenaEnaManifest,
  type SenaEvidenceLedger,
  type SenaEvidenceSnippet,
  type SenaEvidenceSource,
  type SenaFusionMathAudit,
  type SenaGroupComparisonMetric,
  type SenaGroupComparisonResult,
  type SenaGroupComparisonValidationResult,
  type SenaJenaConceptPairHandoffRow,
  type SenaJsnaSocialTieHandoffRow,
  type SenaLayer,
  type SenaLayoutMode,
  type SenaMatrixFingerprint,
  type SenaMethodProtocol,
  type SenaModel,
  type SenaNode,
  type SenaNormalization,
  type SenaPilotReadinessAudit,
  type SenaProductionPageContract,
  type SenaProjectSnapshot,
  type SenaReportCompletenessAudit,
  type SenaReportHumanReview,
  type SenaReviewPacketAudit,
  type SenaRuntimeConsistencyAudit,
  type SenaSnaManifest,
  type SenaTemporalMode,
  type SenaTemporalRuntimeTrace,
  type SenaTemporalWindow,
  type SenaValidation
} from "@/lib/sena";
import { cn } from "@/lib/utils";

const SHOW_ARCHIVED_FORMULA_PANEL = false;
const senaEnterpriseImportFileAccept = ".csv,.json,.xlsx,.xls,.txt,.md,.srt,.vtt,text/csv,application/json,text/plain,text/vtt,application/x-subrip";
const platformDecisionTimestampedEvidenceIds = new Set([
  "idp-tenant-approval",
  "idp-callback-approval",
  "sso-provider-secrets",
  "sso-secret-store-reference",
  "sso-secret-rotation",
  "provisioning-owner",
  "scim-or-idp-ownership",
  "bearer-token-rotation",
  "lifecycle-guardrails"
]);

type PositionedNode = SenaNode & {
  x: number;
  y: number;
};

type LayerVisibility = Record<SenaLayer, boolean>;

type UploadedSenaTable = SenaMappedTable & { id: string };

type EvidenceSourceFilter = SenaEvidenceSource | "all";
type WorkspaceRailMode = "sets" | "model" | "plots" | "stats";
type SenaPlotView = "temporal" | "fusion" | "dual" | "ena" | "sna" | "evidence" | "matrix";
type PublicationFormat = "svg" | "png" | "html" | "xlsx" | "docx" | "pdf" | "package";

type DemoManualReviewState = Record<string, SenaDemoVerificationCheck["manualReview"]>;
type EnterpriseContext = {
  user: { id: string; email: string; name: string; organization: string } | null;
  teams: Array<{ id: string; name: string; plan: string; organization: string }>;
  memberships: Array<{ id: string; teamId: string; userId: string; role: string; status: string }>;
};
type EnterpriseRole = "owner" | "pi" | "admin" | "coder" | "reviewer" | "viewer";
type EnterpriseCsrfToken = {
  headerName: string;
  token: string;
  sessionId: string;
  expiresAt: string;
};
type EnterpriseTeamState = {
  teams: Array<{ id: string; name: string; plan: string; organization: string }>;
  memberships: Array<{ id: string; teamId: string; userId: string; role: EnterpriseRole; status: "active" | "suspended"; updatedAt: string }>;
  users: Array<{ id: string; email: string; name: string; organization: string }>;
  invitations: Array<{ id: string; teamId: string; email: string; role: EnterpriseRole; inviteCode: string; status: "pending" | "accepted" | "revoked"; createdAt: string; acceptedAt?: string }>;
  notifications: Array<{ id: string; kind: string; status: string; title: string; createdAt: string }>;
  auditLog: Array<{ id: string; event: string; createdAt: string }>;
};
type EnterpriseUploadRecord = {
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
type EnterpriseUploadStorageVerification = {
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
type EnterpriseUploadStorageState = {
  schemaVersion: "sena-upload-list/v1";
  uploads: EnterpriseUploadRecord[];
  storageVerification?: EnterpriseUploadStorageVerification;
};
type EnterpriseMfaStatus = {
  schemaVersion: "sena-enterprise-mfa-status/v1";
  enabled: boolean;
  method: "totp" | null;
  factorId?: string;
  verifiedAt?: string;
  lastUsedAt?: string;
};
type EnterpriseMfaSetup = {
  schemaVersion: "sena-enterprise-mfa-setup/v1";
  method: "totp";
  setupToken: string;
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
};
type EnterpriseSessionSummary = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  sessionProfile?: "standard" | "remembered";
  ttlDays?: number;
};
type EnterpriseSessionList = {
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
type EnterpriseSsoProvider = "institution" | "google" | "orcid";
type EnterpriseSsoProviderPreflight = {
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
type EnterpriseSsoPreflight = {
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
type EnterpriseSsoProviderStatusResponse = {
  schemaVersion: "sena-sso-provider-status/v1";
  preflight?: EnterpriseSsoPreflight;
};
type EnterpriseDeploymentEnv = {
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
type EnterpriseDeploymentServiceEndpoint = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: string;
  schema?: string;
  purpose: string;
};
type EnterpriseDeploymentPlatformDecision = {
  id: string;
  label: string;
  status: "ready" | "bridge-ready" | "open";
  evidence: string[];
  nextAction: string;
};
type EnterpriseIdentityProductionEvidence = {
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
type EnterpriseIdentityPlatformDecisionRequestPacket = {
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
    path: "/api/sena/ops/platform-decisions";
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
type EnterpriseIdentityInstitutionActionPlan = {
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
    submissionPath: "/api/sena/ops/platform-decisions";
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
type EnterpriseIdentityProductionEvidenceDossier = {
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
type EnterpriseOrganizationDeploymentPackage = {
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
type EnterpriseProjectSummary = {
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
type EnterpriseImportRun = {
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
type EnterpriseAnalysisRun = {
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
type EnterpriseValidationParityEvidence = {
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
type LocalValidationPreregistrationPlan = {
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
type EnterpriseCollaborationState = {
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
type LocalEnterpriseValidationResult = {
  schemaVersion: "sena-local-validation-run/v1";
  generatedAt: string;
  result: SenaGroupComparisonValidationResult;
  preregistrationNote: string;
  methodNote: string;
  studySpecificInferenceReference: string;
  preregistrationPlan?: LocalValidationPreregistrationPlan;
};
type EnterpriseClaimEvidencePackage = {
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
type EnterprisePlatformDecisionId =
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
type EnterprisePlatformDecisionStatus = "accepted" | "rejected" | "needs-native-adapter" | "superseded";
type EnterprisePlatformDecisionAcceptance = {
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
type EnterprisePlatformDecisionRegister = {
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
type EnterprisePlatformDecisionState = {
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
type EnterpriseReleaseGateDecision = "approved" | "blocked" | "conditional";
type EnterpriseReleaseVerificationStatus = "passed" | "failed" | "not-run";
type EnterpriseReleaseGateDraft = {
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
type EnterpriseGoLiveRehearsal = {
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
type EnterpriseGoLiveAttestation = {
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
type EnterpriseReleaseGateReview = {
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
type EnterpriseReleaseGateState = {
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

const width = 900;
const height = 620;
const center = { x: width / 2, y: height / 2 };
const conceptGuideRadius = 184;
const fusionPlotZoomMin = 0.75;
const fusionPlotZoomMax = 2;
const fusionPlotZoomStep = 0.125;
const enterpriseValidationMetrics: Array<{ value: SenaGroupComparisonMetric; label: string }> = [
  { value: "bridgeScore", label: "Bridge score" },
  { value: "epistemicContribution", label: "Epistemic contribution" },
  { value: "epistemicDiversity", label: "Epistemic diversity" },
  { value: "socialStrength", label: "Social strength" },
  { value: "socialDegree", label: "Social degree" },
  { value: "conceptBrokerage", label: "Concept brokerage" },
  { value: "alignment", label: "Alignment" }
];
const enterprisePlatformDecisionOptions: Array<{ id: EnterprisePlatformDecisionId; label: string }> = [
  { id: "native-managed-database", label: "Managed database bridge" },
  { id: "native-managed-object-storage", label: "Object storage bridge" },
  { id: "native-collaboration-pubsub", label: "Collaboration pub/sub" },
  { id: "institution-idp-approval", label: "IdP approval" },
  { id: "institution-provisioning-owner", label: "Provisioning owner" },
  { id: "deployment-alerting-escalation", label: "Alert escalation" },
  { id: "native-audit-siem-adapter", label: "Audit/SIEM bridge" },
  { id: "institution-email-provider", label: "Email provider" },
  { id: "native-managed-backup-storage", label: "Backup storage" },
  { id: "full-saas-backend-operations", label: "Full SaaS operating model" }
];
const enterprisePlatformDecisionStatuses: Array<{ value: EnterprisePlatformDecisionStatus; label: string }> = [
  { value: "accepted", label: "Accepted" },
  { value: "needs-native-adapter", label: "Needs native adapter" },
  { value: "rejected", label: "Rejected" },
  { value: "superseded", label: "Superseded" }
];
const enterpriseReleaseGateDecisions: Array<{ value: EnterpriseReleaseGateDecision; label: string }> = [
  { value: "conditional", label: "Conditional" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" }
];
const enterpriseSsoProviderOptions: Array<{ value: EnterpriseSsoProvider; label: string }> = [
  { value: "institution", label: "Institution IdP" },
  { value: "google", label: "Google" },
  { value: "orcid", label: "ORCID" }
];

function clampFusionPlotZoom(value: number) {
  return Math.min(fusionPlotZoomMax, Math.max(fusionPlotZoomMin, Number(value.toFixed(3))));
}

function formatFusionPlotZoom(value: number) {
  return `${Math.round(value * 100)}%`;
}

const layerCopy: Record<SenaLayer, { label: string; detail: string; className: string }> = {
  social: {
    label: "SNA",
    detail: "person-person ties",
    className: "border-blue-400/50 bg-blue-400/10 text-blue-200"
  },
  concept: {
    label: "ENA",
    detail: "code-code co-occurrence",
    className: "border-violetGlow/50 bg-violetGlow/10 text-violetGlow"
  },
  bridge: {
    label: "SENA",
    detail: "person-code contribution",
    className: "border-cyanGlow/50 bg-cyanGlow/10 text-cyanGlow"
  }
};

const layoutOptions: Array<{ value: SenaLayoutMode; label: string; icon: ElementType; note: string }> = [
  { value: "explanatory", label: "Explanatory", icon: Orbit, note: "Readable three-layer layout" },
  { value: "ena-space", label: "ENA Space", icon: Sigma, note: "jENA projected points and code positions" },
  { value: "joint", label: "Joint", icon: GitMerge, note: "Deterministic A_fusion embedding" }
];

const temporalModeOptions: Array<{ value: SenaTemporalMode; label: string }> = [
  { value: "stage", label: "Stage" },
  { value: "moving-window", label: "Moving" },
  { value: "turn-window", label: "Turn" }
];

const evidenceSourceOptions: Array<{ value: EvidenceSourceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "social-edge", label: "SNA" },
  { value: "concept-edge", label: "ENA" },
  { value: "bridge-edge", label: "Bridge" },
  { value: "pair-contribution", label: "G" },
  { value: "temporal-window", label: "Temporal" }
];

function StatsNetworkMetricsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 23V15.5M12.25 23V12M16.5 23V16.25M20.75 23V18.25M25 23V12.75"
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="round"
        opacity="0.34"
      />
      <path
        d="M8.25 20.75L16 8.75L23.75 20.75M8.25 20.75H23.75"
        stroke="currentColor"
        strokeWidth="3.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.25" cy="20.75" r="3.65" fill="currentColor" />
      <circle cx="16" cy="8.75" r="3.65" fill="currentColor" />
      <circle cx="23.75" cy="20.75" r="3.65" fill="currentColor" />
    </svg>
  );
}

function ModelLayerStackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 10.2L16 6.4L24 10.2L16 14L8 10.2Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M8 10.2L16 6.4L24 10.2L16 14L8 10.2Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M8 15.9L16 12.1L24 15.9L16 19.7L8 15.9Z"
        fill="currentColor"
        opacity="0.26"
      />
      <path
        d="M8 15.9L16 12.1L24 15.9L16 19.7L8 15.9Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
        opacity="0.86"
      />
      <path
        d="M8 21.6L16 17.8L24 21.6L16 25.4L8 21.6Z"
        fill="currentColor"
        opacity="0.34"
      />
      <path
        d="M8 21.6L16 17.8L24 21.6L16 25.4L8 21.6Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 21.2L20.8 10.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.92"
      />
      <circle cx="11.2" cy="21.2" r="2.15" fill="currentColor" />
      <circle cx="20.8" cy="10.8" r="2.15" fill="currentColor" />
    </svg>
  );
}

const workspaceRailItems: Array<{ id: WorkspaceRailMode; label: string; href: string; icon: ElementType; iconName: string; visualRole?: string }> = [
  { id: "sets", label: "Sets", href: "#workflow-data", icon: Database, iconName: "database" },
  { id: "model", label: "Model", href: "#workflow-model", icon: ModelLayerStackIcon, iconName: "layer-stack", visualRole: "workspace-rail-model-layer-stack-icon" },
  { id: "plots", label: "Plot Tools", href: "#workflow-canvas", icon: Activity, iconName: "activity" },
  { id: "stats", label: "Stats", href: "#sena-stats-deck", icon: StatsNetworkMetricsIcon, iconName: "network-metrics", visualRole: "workspace-rail-network-metrics-icon" }
];

const workspaceRailPanelCopy: Record<WorkspaceRailMode, { title: string; subtitle: string; badge: string; activeWorkflowId: string }> = {
  sets: {
    title: "Sets",
    subtitle: "Import, audit, and prepare SENA contract tables",
    badge: "Data",
    activeWorkflowId: "workflow-data"
  },
  model: {
    title: "Model",
    subtitle: "Tune S/W/B/G construction and local runtime parameters",
    badge: "Build",
    activeWorkflowId: "workflow-model"
  },
  plots: {
    title: "Plot Tools",
    subtitle: "Switch plots, layers, thresholds, and temporal framing",
    badge: "Canvas",
    activeWorkflowId: "workflow-canvas"
  },
  stats: {
    title: "Stats",
    subtitle: "Inspect jSNA metrics, G contribution, and validation outputs",
    badge: "Metrics",
    activeWorkflowId: "sena-stats-deck"
  }
};

const plotViewOptions: Array<{ id: SenaPlotView; label: string; detail: string }> = [
  { id: "fusion", label: "Fusion", detail: "Current window A1 canvas" },
  { id: "dual", label: "Dual Lens", detail: "Conversation + split metrics" },
  { id: "temporal", label: "Temporal", detail: "Plan -> Teach -> Reflect" },
  { id: "ena", label: "ENA Space", detail: "jENA unit/code positions" },
  { id: "sna", label: "SNA", detail: "jSNA actor metrics" },
  { id: "evidence", label: "Evidence", detail: "Selected excerpts" },
  { id: "matrix", label: "Matrix", detail: "S/W/B/G previews" }
];

const evidenceSourceCopy: Record<SenaEvidenceSource, { label: string; className: string }> = {
  "social-edge": {
    label: "SNA edge",
    className: "border-blue-400/45 bg-blue-400/10 text-blue-200"
  },
  "concept-edge": {
    label: "ENA edge",
    className: "border-violetGlow/45 bg-violetGlow/10 text-violetGlow"
  },
  "bridge-edge": {
    label: "Bridge edge",
    className: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow"
  },
  "pair-contribution": {
    label: "G pair",
    className: "border-fuchsia-300/45 bg-fuchsia-300/10 text-fuchsia-100"
  },
  "temporal-window": {
    label: "Temporal",
    className: "border-emerald-300/45 bg-emerald-300/10 text-emerald-100"
  }
};

const productionPageContract = buildSenaProductionPageContract();

const workflowSteps = [
  { id: "workflow-data", label: "Data Import", detail: "Contract tables", href: "#workflow-data" },
  { id: "workflow-model", label: "Model Builder", detail: "S/W/B/G + weights", href: "#workflow-model" },
  { id: "workflow-canvas", label: "Fusion Canvas", detail: "Typed graph", href: "#workflow-canvas" },
  { id: "workflow-evidence", label: "Evidence", detail: "Nodes, edges, excerpts", href: "#workflow-evidence" },
  { id: "workflow-temporal", label: "Temporal Trace", detail: "Stage and turn windows", href: "#workflow-temporal" },
  { id: "workflow-report", label: "Report", detail: "Review-ready export", href: "#workflow-report" }
];

type WorkflowStatus = "ready" | "review";

type WorkflowStepState = (typeof workflowSteps)[number] & {
  status: WorkflowStatus;
  statusLabel: string;
};

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function formatDelta(value: number, digits = 1) {
  const formatted = formatNumber(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatPercentValue(value: number | undefined, digits = 1) {
  return Number.isFinite(value) ? `${formatNumber((value ?? 0) * 100, digits)}%` : "NA";
}

function primaryGroupComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === "sena-group-comparison-suite/v1" ? result.primary : result;
}

function validationResultSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryGroupComparison(result);
  return `${primary.metric} ${primary.groupA} vs ${primary.groupB}, p=${formatNumber(primary.permutation.pTwoSided, 4)}`;
}

function validationSuiteSummary(result: SenaGroupComparisonValidationResult) {
  if (result.schemaVersion !== "sena-group-comparison-suite/v1") return null;
  const minimumAdjustedP = result.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1);
  return `Holm suite ${result.comparisonCount} comparisons, ${result.significantHolmCount} significant at alpha ${formatNumber(result.alpha, 3)}, min adjusted p=${formatNumber(minimumAdjustedP, 4)}`;
}

function validationComparisonPlanRow(result: SenaGroupComparisonResult) {
  return {
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB
  };
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

async function sha256Text(text: string) {
  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!cryptoSubtle) {
    throw new Error("Validation preregistration plan export requires browser SHA-256 support.");
  }
  const digest = await cryptoSubtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildLocalValidationPreregistrationPlan(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationNote: string;
  methodNote: string;
}): Promise<LocalValidationPreregistrationPlan> {
  const primary = primaryGroupComparison(input.result);
  const suite = input.result.schemaVersion === "sena-group-comparison-suite/v1" ? input.result : null;
  const analysis: LocalValidationPreregistrationPlan["analysis"] = suite ? "holm-suite" : "single-comparison";
  const comparisons = suite
    ? suite.comparisons.map(validationComparisonPlanRow)
    : [validationComparisonPlanRow(primary)];
  const parameters: LocalValidationPreregistrationPlan["parameters"] = {
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    seed: primary.permutation.seed,
    ...(suite ? { alpha: suite.alpha, correction: suite.correction } : {})
  };
  const protocolNote = input.preregistrationNote.trim();
  const methodNote = input.methodNote.trim();
  const [protocolNoteHash, methodNoteHash] = await Promise.all([
    sha256Text(protocolNote),
    sha256Text(methodNote)
  ]);
  const planBody: Omit<LocalValidationPreregistrationPlan, "planHash"> = {
    schemaVersion: "sena-validation-preregistration-plan/v1",
    hashAlgorithm: "sha256",
    analysis,
    primary: validationComparisonPlanRow(primary),
    comparisons,
    parameters,
    protocolNoteHash,
    methodNoteHash,
    guardrail: primary.guardrail,
    evidence: [
      `protocolNote=${protocolNote ? "present" : "missing"}`,
      `methodNote=${methodNote ? "present" : "missing"}`,
      `analysis=${analysis}`,
      `comparisons=${comparisons.length}`,
      ...(suite ? [`correction=${suite.correction}`] : []),
      `permutationIterations=${parameters.permutationIterations}`,
      `bootstrapIterations=${parameters.bootstrapIterations}`,
      `seed=${parameters.seed}`
    ]
  };
  return {
    ...planBody,
    planHash: await sha256Text(stableJsonStringify(planBody))
  };
}

function matrixTotal(values: number[][]) {
  return values.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + (Number.isFinite(value) ? value : 0), 0), 0);
}

function formatShare(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || Math.abs(total) < 1e-9) return "NA";
  return `${formatNumber((value / total) * 100, 0)}%`;
}

function conceptPairKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

type WorkspaceRankingContextRow = {
  id: "top-social-tie" | "top-concept-tie" | "top-bridge-tie" | "top-g-pair";
  label: string;
  layer: "S" | "W" | "B" | "G";
  signalLabel: string;
  currentWeight: number;
  baselineWeight: number;
  baselineRank: number | null;
  baselineItemCount: number;
  baselineShare: number | null;
};

function rankedWorkspaceEdges(model: SenaModel, layer: SenaLayer) {
  return [...model.edges]
    .filter((edge) => edge.layer === layer && edge.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

function rankedWorkspaceGPairs(model: SenaModel) {
  return [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
}

function pairReportSelectionTarget(model: SenaModel, pair: SenaModel["pairReport"][number]) {
  const conceptEdge = model.edges.find((edge) => (
    edge.layer === "concept" &&
    (
      (edge.source === pair.codeA && edge.target === pair.codeB) ||
      (edge.source === pair.codeB && edge.target === pair.codeA)
    )
  ));
  if (conceptEdge) return conceptEdge.id;

  const contributor = pair.topContributors[0];
  if (contributor) {
    const bridgeEdge = model.edges
      .filter((edge) => (
        edge.layer === "bridge" &&
        edge.source === contributor.id &&
        (edge.target === pair.codeA || edge.target === pair.codeB)
      ))
      .sort((a, b) => b.scaledWeight - a.scaledWeight || a.label.localeCompare(b.label))[0];
    if (bridgeEdge) return bridgeEdge.id;
  }

  return model.summary.strongestConceptTie?.id ??
    model.summary.strongestBridgeTie?.id ??
    model.summary.strongestSocialTie?.id ??
    model.nodes[0]?.id ??
    "";
}

function formatRank(rank: number | null, total: number) {
  return rank === null ? "NA" : `${rank}/${total}`;
}

function buildEdgeRankingContextRow({
  id,
  label,
  layer,
  currentEdge,
  baselineEdges
}: {
  id: WorkspaceRankingContextRow["id"];
  label: string;
  layer: WorkspaceRankingContextRow["layer"];
  currentEdge?: SenaEdge;
  baselineEdges: SenaEdge[];
}): WorkspaceRankingContextRow {
  const baselineIndex = currentEdge ? baselineEdges.findIndex((edge) => edge.id === currentEdge.id) : -1;
  const baselineEdge = baselineIndex >= 0 ? baselineEdges[baselineIndex] : undefined;
  const baselineTotal = baselineEdges.reduce((total, edge) => total + edge.weight, 0);
  return {
    id,
    label,
    layer,
    signalLabel: currentEdge?.label ?? "NA",
    currentWeight: currentEdge?.weight ?? 0,
    baselineWeight: baselineEdge?.weight ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselineEdges.length,
    baselineShare: baselineEdge && baselineTotal > 0 ? baselineEdge.weight / baselineTotal : null
  };
}

function buildGPairRankingContextRow({
  currentPair,
  baselinePairs
}: {
  currentPair?: SenaModel["pairReport"][number];
  baselinePairs: SenaModel["pairReport"];
}): WorkspaceRankingContextRow {
  const baselineIndex = currentPair ? baselinePairs.findIndex((pair) => pair.id === currentPair.id) : -1;
  const baselinePair = baselineIndex >= 0 ? baselinePairs[baselineIndex] : undefined;
  const baselineTotal = baselinePairs.reduce((total, pair) => total + pair.totalContribution, 0);
  return {
    id: "top-g-pair",
    label: "Top G",
    layer: "G",
    signalLabel: currentPair?.label ?? "NA",
    currentWeight: currentPair?.totalContribution ?? 0,
    baselineWeight: baselinePair?.totalContribution ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselinePairs.length,
    baselineShare: baselinePair && baselineTotal > 0 ? baselinePair.totalContribution / baselineTotal : null
  };
}

function upperTriangleTotal(values: number[][]) {
  let total = 0;
  for (let row = 0; row < values.length; row += 1) {
    for (let column = row + 1; column < (values[row]?.length ?? 0); column += 1) {
      const value = values[row]?.[column] ?? 0;
      total += Number.isFinite(value) ? value : 0;
    }
  }
  return total;
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

function socialNodePositions(people: SenaModel["people"]) {
  const positions = new Map<string, { x: number; y: number }>();
  const radiusX = 335;
  const radiusY = 235;

  people.forEach((person, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / people.length;
    positions.set(person.id, {
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY
    });
  });

  return positions;
}

function conceptAnchorPositions(model: SenaModel, radius = 148) {
  const positions = new Map<string, { x: number; y: number }>();
  model.codes.forEach((code, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / model.codes.length;
    positions.set(code.id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  });
  return positions;
}

function explanatoryLayout(model: SenaModel): PositionedNode[] {
  const people = socialNodePositions(model.people);
  const concepts = conceptAnchorPositions(model, 150);

  return model.nodes.map((node) => {
    const position = node.kind === "person" ? people.get(node.id) : concepts.get(node.id);
    return { ...node, x: position?.x ?? center.x, y: position?.y ?? center.y };
  });
}

function enaSpaceLayout(model: SenaModel, enaManifest?: SenaEnaManifest): PositionedNode[] {
  if (enaManifest) {
    const jenaCoordinates = buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes, {
      width,
      height,
      marginX: 92,
      marginY: 78
    });
    if (jenaCoordinates.status === "computed") {
      const fallback = explanatoryLayout(model);
      return model.nodes.map((node, index) => {
        const position = jenaCoordinates.coordinates[node.id] ?? fallback[index];
        return { ...node, x: position?.x ?? center.x, y: position?.y ?? center.y };
      });
    }
  }

  const concepts = conceptAnchorPositions(model, 178);
  const codeOrder = model.codes.map((code) => code.id);

  return model.nodes.map((node, index) => {
    if (node.kind === "concept") {
      const position = concepts.get(node.id);
      return { ...node, x: position?.x ?? center.x, y: position?.y ?? center.y };
    }

    const rowIndex = model.people.findIndex((person) => person.id === node.id);
    const contribution = model.matrices.B.normalized[rowIndex] ?? [];
    const total = contribution.reduce((acc, value) => acc + value, 0);
    if (total === 0) return { ...node, x: center.x - 270 + index * 20, y: center.y + 210 };

    const position = codeOrder.reduce(
      (acc, codeId, codeIndex) => {
        const anchor = concepts.get(codeId) ?? center;
        const weight = contribution[codeIndex] ?? 0;
        return {
          x: acc.x + anchor.x * weight,
          y: acc.y + anchor.y * weight
        };
      },
      { x: 0, y: 0 }
    );

    const offset = (rowIndex - model.people.length / 2) * 12;
    return {
      ...node,
      x: center.x + (position.x / total - center.x) * 1.28 + offset,
      y: center.y + (position.y / total - center.y) * 1.28 - offset * 0.5
    };
  });
}

// Deterministic force layout over A_fusion weights; this is a visual embedding, not an inferential distance model.
function jointLayout(model: SenaModel): PositionedNode[] {
  const initial = explanatoryLayout(model);
  const coords = initial.map((node) => ({
    x: (node.x - center.x) / 310,
    y: (node.y - center.y) / 245
  }));
  const weights = model.matrices.fusion.values;

  for (let iteration = 0; iteration < 130; iteration += 1) {
    const forces = coords.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        const dx = coords[j].x - coords[i].x;
        const dy = coords[j].y - coords[i].y;
        const distance = Math.max(0.08, Math.sqrt(dx * dx + dy * dy));
        const repulsion = 0.006 / (distance * distance);
        forces[i].x -= (dx / distance) * repulsion;
        forces[i].y -= (dy / distance) * repulsion;
        forces[j].x += (dx / distance) * repulsion;
        forces[j].y += (dy / distance) * repulsion;

        const attraction = Math.max(weights[i]?.[j] ?? 0, weights[j]?.[i] ?? 0);
        if (attraction > 0) {
          const target = Math.max(0.28, 1.1 - attraction * 0.55);
          const pull = (distance - target) * 0.018 * attraction;
          forces[i].x += (dx / distance) * pull;
          forces[i].y += (dy / distance) * pull;
          forces[j].x -= (dx / distance) * pull;
          forces[j].y -= (dy / distance) * pull;
        }
      }
    }

    for (let i = 0; i < coords.length; i += 1) {
      coords[i].x = Math.max(-1.35, Math.min(1.35, coords[i].x + forces[i].x));
      coords[i].y = Math.max(-1.22, Math.min(1.22, coords[i].y + forces[i].y));
    }
  }

  return initial.map((node, index) => ({
    ...node,
    x: center.x + coords[index].x * 285,
    y: center.y + coords[index].y * 230
  }));
}

function computeLayout(model: SenaModel, layout: SenaLayoutMode, enaManifest?: SenaEnaManifest) {
  if (layout === "ena-space") return enaSpaceLayout(model, enaManifest);
  if (layout === "joint") return jointLayout(model);
  return explanatoryLayout(model);
}

function hexPoints(x: number, y: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 6 + (index * Math.PI * 2) / 6;
    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function nodeRadius(node: PositionedNode) {
  if (node.kind === "concept") return 28 + Math.min(10, node.metrics.weightedDegree * 0.75);
  return 25 + Math.min(12, Math.max(0, node.metrics.bridgeScore + 1.5) * 3.2);
}

function readableLabelWidth(label: string, min = 72, max = 142) {
  return Math.min(max, Math.max(min, label.length * 7.6 + 28));
}

function readableConceptGlyph(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("question")) return "Q";
  if (normalized.includes("explanation")) return "X";
  if (normalized.includes("coordination")) return "Co";
  const initials = label
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || label.slice(0, 2).toUpperCase();
}

type EdgeStrokeScale = {
  layers: Record<SenaLayer, { min: number; max: number; span: number }>;
  signals: Map<string, number>;
};

const edgeStrokeRanges: Record<SenaLayer, { min: number; max: number }> = {
  social: { min: 5.2, max: 15.6 },
  concept: { min: 3.2, max: 12.4 },
  bridge: { min: 2.4, max: 10.8 }
};

function codePairKey(codeA: string, codeB: string) {
  return codeA < codeB ? `${codeA}|${codeB}` : `${codeB}|${codeA}`;
}

function buildConceptPairContributionMap(model: SenaModel) {
  return new Map(model.pairReport.map((pair) => [
    codePairKey(pair.codeA, pair.codeB),
    pair.totalContribution
  ]));
}

function edgeStrokeSignal(edge: SenaEdge, conceptPairContributions: Map<string, number>) {
  if (edge.layer !== "concept") return edge.scaledWeight;
  const gContribution = conceptPairContributions.get(codePairKey(edge.source, edge.target)) ?? 0;
  return edge.scaledWeight + Math.log1p(gContribution) / 100;
}

function buildEdgeStrokeScale(edges: SenaEdge[], conceptPairContributions: Map<string, number>): EdgeStrokeScale {
  const signals = new Map(edges.map((edge) => [edge.id, edgeStrokeSignal(edge, conceptPairContributions)]));
  const layers = (["social", "concept", "bridge"] as SenaLayer[]).reduce((scale, layer) => {
    const weights = edges
      .filter((edge) => edge.layer === layer)
      .map((edge) => signals.get(edge.id) ?? edge.scaledWeight)
      .filter((weight) => Number.isFinite(weight));
    const min = weights.length > 0 ? Math.min(...weights) : 0;
    const max = weights.length > 0 ? Math.max(...weights) : 1;
    scale[layer] = { min, max, span: max - min };
    return scale;
  }, {} as Record<SenaLayer, { min: number; max: number; span: number }>);

  return { layers, signals };
}

function readableEdgeStrokeWidth(edge: SenaEdge, scale: EdgeStrokeScale) {
  const range = edgeStrokeRanges[edge.layer];
  const layerScale = scale.layers[edge.layer];
  const signal = scale.signals.get(edge.id) ?? edge.scaledWeight;
  const rawIntensity = layerScale.span > 1e-6
    ? (signal - layerScale.min) / layerScale.span
    : edge.normalizedWeight;
  const intensity = Math.min(1, Math.max(0, Math.pow(rawIntensity, 0.72)));
  return Number((range.min + intensity * (range.max - range.min)).toFixed(2));
}

function readableEdgeStrokeSignal(edge: SenaEdge, scale: EdgeStrokeScale) {
  return scale.signals.get(edge.id) ?? edge.scaledWeight;
}

function edgeStroke(edge: SenaEdge) {
  if (edge.layer === "social") return "#2f73ff";
  if (edge.layer === "concept") return "url(#concept-link-gradient)";
  return "url(#bridge-gradient)";
}

function straightEdgePath(source: PositionedNode, target: PositionedNode) {
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function socialArcPath(source: PositionedNode, target: PositionedNode) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2
  };
  let outwardX = midpoint.x - center.x;
  let outwardY = midpoint.y - center.y;
  const outwardLength = Math.sqrt(outwardX * outwardX + outwardY * outwardY);

  if (outwardLength < 16) {
    outwardX = -dy / distance;
    outwardY = dx / distance;
  } else {
    outwardX /= outwardLength;
    outwardY /= outwardLength;
  }

  const baseCurve = Math.min(260, Math.max(118, distance * 0.34));
  const centerClearance = Math.max(0, conceptGuideRadius + 84 - outwardLength) * 2.05;
  const curve = Math.max(baseCurve, centerClearance);
  const control = {
    x: midpoint.x + outwardX * curve,
    y: midpoint.y + outwardY * curve
  };

  return `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`;
}

function bridgeRibbonPath(source: PositionedNode, target: PositionedNode) {
  const mx = (source.x + target.x) / 2;
  const my = (source.y + target.y) / 2;
  const curve = source.kind === "person" ? -32 : 32;
  return `M ${source.x} ${source.y} Q ${mx} ${my + curve} ${target.x} ${target.y}`;
}

function edgePath(edge: SenaEdge, positions: Map<string, PositionedNode>) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return "";
  if (edge.layer === "social") return socialArcPath(source, target);
  if (edge.layer === "bridge") return bridgeRibbonPath(source, target);
  return straightEdgePath(source, target);
}

function Panel({
  id,
  title,
  icon: Icon,
  children,
  className
}: {
  id?: string;
  title: string;
  icon: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("glass-panel min-w-0 scroll-mt-24 rounded-lg p-5", className)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyanGlow/12 text-cyanGlow">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricCell({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div data-testid={testId} className="min-w-0 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="truncate text-xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

const metricSourceLabels: Record<string, string> = {
  "sna.js": "Direct jSNA",
  "jena-js": "jENA",
  "sena-derived-from-sna.js": "SENA-derived",
  "sena-self-implemented": "SENA implemented",
  "sena-composite": "SENA composite"
};

function MetricProvenanceSummary({ validation }: { validation: SenaValidation }) {
  const metrics = validation.metricProvenance;
  const sourceCounts = Array.from(
    metrics.reduce((counts, metric) => counts.set(metric.source, (counts.get(metric.source) ?? 0) + 1), new Map<string, number>())
  ).sort(([sourceA], [sourceB]) => (metricSourceLabels[sourceA] ?? sourceA).localeCompare(metricSourceLabels[sourceB] ?? sourceB));
  const scopeCounts = Array.from(
    metrics.reduce((counts, metric) => counts.set(metric.scope, (counts.get(metric.scope) ?? 0) + 1), new Map<string, number>())
  ).sort(([scopeA], [scopeB]) => scopeA.localeCompare(scopeB));
  const parityCovered = metrics.filter((metric) => !/no .*parity|deferred/i.test(metric.parityStatus)).length;
  const interpretationLimits = metrics.filter((metric) => metric.interpretationLimit.trim().length > 0).length;

  return (
    <div
      data-testid="stats-metric-provenance-summary"
      data-visual-role="stats-metric-provenance-summary"
      className="grid gap-3 rounded-lg border border-cyanGlow/25 bg-cyanGlow/8 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-cyanGlow">Metric provenance summary</div>
          <div className="mt-1 text-sm font-black text-slate-950">sena-metric-provenance/v1</div>
        </div>
        <Info className="h-4 w-4 shrink-0 text-cyanGlow" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Metrics" value={metrics.length} />
        <MetricCell label="Parity covered" value={`${parityCovered}/${metrics.length}`} />
        <MetricCell label="Limits declared" value={interpretationLimits} />
        <MetricCell label="Scopes" value={scopeCounts.length} />
      </div>
      <div className="grid gap-2">
        <div className="text-[0.68rem] font-black uppercase text-slate-500">Sources</div>
        <div className="flex flex-wrap gap-1.5">
          {sourceCounts.map(([source, count]) => (
            <span key={source} className="rounded-full border border-white/80 bg-white/75 px-2 py-1 text-[0.68rem] font-black text-slate-700">
              {metricSourceLabels[source] ?? source}: {count}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="text-[0.68rem] font-black uppercase text-slate-500">Scopes</div>
        <div className="flex flex-wrap gap-1.5">
          {scopeCounts.map(([scope, count]) => (
            <span key={scope} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[0.68rem] font-black text-slate-600">
              {scope}: {count}
            </span>
          ))}
        </div>
      </div>
      <div className="text-xs font-semibold leading-5 text-slate-500">
        Direct jSNA, jENA, SENA-implemented, and composite metrics stay separated before report export.
      </div>
    </div>
  );
}

function runtimeAuditNumber(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  const value = item?.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function runtimeAuditBoolean(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  return item?.metrics?.[key] === true;
}

function runtimeAuditStringList(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  const value = item?.metrics?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function JenaConceptHandoffPanel({ audit }: { audit: SenaRuntimeConsistencyAudit }) {
  const item = audit.items.find((candidate) => candidate.id === "jena-concept-matrix");
  const expectedPairs = runtimeAuditNumber(item, "expectedPairs");
  const adjacencyPairs = runtimeAuditNumber(item, "adjacencyPairs");
  const positiveJenaPairs = runtimeAuditNumber(item, "positiveJenaPairs");
  const positiveSenaWPairs = runtimeAuditNumber(item, "positiveSenaWPairs");
  const overlapPairs = runtimeAuditNumber(item, "overlapPairs");
  const finiteColumns = runtimeAuditBoolean(item, "finiteColumns");
  const positiveJenaMapsToW = runtimeAuditBoolean(item, "allPositiveJenaPairsMapToSenaW");
  const overlapPreview = runtimeAuditStringList(item, "overlapPreview");
  const missingPreview = runtimeAuditStringList(item, "missingPositiveJenaPairPreview");
  const senaOnlyPreview = runtimeAuditStringList(item, "senaOnlyWPairPreview");

  return (
    <div
      data-testid="stats-jena-concept-handoff"
      data-visual-role="stats-jena-concept-pair-handoff"
      data-status={item?.status ?? "missing"}
      data-expected-pairs={expectedPairs}
      data-adjacency-pairs={adjacencyPairs}
      data-positive-jena-pairs={positiveJenaPairs}
      data-positive-sena-w-pairs={positiveSenaWPairs}
      data-overlap-pairs={overlapPairs}
      className="grid gap-3 rounded-lg border border-violet-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-violet-700">jENA concept-pair handoff</div>
          <div className="mt-1 text-sm font-black text-slate-950">SENA W coverage audit</div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[0.62rem] font-black uppercase",
            item?.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
          )}
        >
          {item?.status ?? "missing"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Adjacency pairs" value={`${adjacencyPairs}/${expectedPairs}`} />
        <MetricCell label="Positive jENA" value={positiveJenaPairs} />
        <MetricCell label="Positive SENA W" value={positiveSenaWPairs} />
        <MetricCell label="SENA W overlap" value={`${overlapPairs} (${formatShare(overlapPairs, positiveJenaPairs)})`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[0.68rem] font-black text-violet-700">
          finite columns: {finiteColumns ? "yes" : "review"}
        </span>
        <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[0.68rem] font-black text-violet-700">
          positive jENA maps to W: {positiveJenaMapsToW ? "yes" : "review"}
        </span>
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-slate-500">
        <div>
          <span className="font-black text-slate-700">Overlap pairs:</span>{" "}
          {overlapPreview.length > 0 ? overlapPreview.join(", ") : "none"}
        </div>
        {(missingPreview.length > 0 || senaOnlyPreview.length > 0) && (
          <div>
            <span className="font-black text-slate-700">Review preview:</span>{" "}
            {missingPreview.length > 0 ? `jENA not in W ${missingPreview.join(", ")}` : "all positive jENA pairs appear in W"}
            {senaOnlyPreview.length > 0 ? `; W-only ${senaOnlyPreview.join(", ")}` : ""}
          </div>
        )}
        <div>
          Semantic handoff only: jENA moving-window connection counts and SENA stanza W are checked for coverage and signal overlap, not forced W-weight equality.
        </div>
      </div>
    </div>
  );
}

function JsnaSocialHandoffPanel({ audit }: { audit: SenaRuntimeConsistencyAudit }) {
  const item = audit.items.find((candidate) => candidate.id === "jsna-social-matrix");
  const labels = runtimeAuditNumber(item, "labels");
  const rows = runtimeAuditNumber(item, "rows");
  const columns = runtimeAuditNumber(item, "columns");
  const socialTieRows = runtimeAuditNumber(item, "socialTieRows");
  const alignedTieRows = runtimeAuditNumber(item, "alignedTieRows");
  const positiveTieRows = runtimeAuditNumber(item, "positiveTieRows");
  const evidenceTieRows = runtimeAuditNumber(item, "evidenceTieRows");
  const labelsAligned = runtimeAuditBoolean(item, "labelsAligned");
  const rawAligned = runtimeAuditBoolean(item, "rawAligned");
  const normalizedAligned = runtimeAuditBoolean(item, "normalizedAligned");
  const socialTieHandoffAligned = runtimeAuditBoolean(item, "socialTieHandoffAligned");
  const socialTiePreview = runtimeAuditStringList(item, "socialTiePreview");

  return (
    <div
      data-testid="stats-jsna-social-handoff"
      data-visual-role="stats-jsna-social-tie-handoff"
      data-status={item?.status ?? "missing"}
      data-social-tie-rows={socialTieRows}
      data-aligned-tie-rows={alignedTieRows}
      data-positive-tie-rows={positiveTieRows}
      data-evidence-tie-rows={evidenceTieRows}
      className="grid gap-3 rounded-lg border border-blue-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-blue-700">jSNA social-tie handoff</div>
          <div className="mt-1 text-sm font-black text-slate-950">SENA S matrix audit</div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[0.62rem] font-black uppercase",
            item?.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
          )}
        >
          {item?.status ?? "missing"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="S labels" value={labels} />
        <MetricCell label="S shape" value={`${rows}x${columns}`} />
        <MetricCell label="Social ties" value={socialTieRows} />
        <MetricCell label="Aligned ties" value={`${alignedTieRows} (${formatShare(alignedTieRows, socialTieRows)})`} />
        <MetricCell label="Positive ties" value={positiveTieRows} />
        <MetricCell label="Evidence ties" value={evidenceTieRows} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          ["labels", labelsAligned],
          ["raw S", rawAligned],
          ["normalized S", normalizedAligned],
          ["tie rows", socialTieHandoffAligned]
        ].map(([label, aligned]) => (
          <span key={label as string} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[0.68rem] font-black text-blue-700">
            {label}: {aligned ? "aligned" : "review"}
          </span>
        ))}
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-slate-500">
        <div>
          <span className="font-black text-slate-700">Tie preview:</span>{" "}
          {socialTiePreview.length > 0 ? socialTiePreview.join(", ") : "none"}
        </div>
        <div>
          Direct matrix handoff: jSNA social matrix rows, SENA S edge weights, and selected-edge evidence references are checked for exact runtime alignment.
        </div>
      </div>
    </div>
  );
}

function MethodProtocolHandoffPanel({
  protocol,
  onExportMethodProtocol
}: {
  protocol: SenaMethodProtocol;
  onExportMethodProtocol: () => void;
}) {
  const passCount = protocol.runtimeHandoffs.filter((handoff) => handoff.status === "pass").length;

  return (
    <div
      data-testid="method-protocol-runtime-handoffs"
      data-visual-role="method-protocol-runtime-handoff-ledger"
      data-handoff-count={protocol.runtimeHandoffs.length}
      data-pass-count={passCount}
      data-runtime-status={protocol.auditSummary.runtimeConsistency.status}
      data-fusion-status={protocol.auditSummary.fusionMath.status}
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Method protocol handoffs</div>
          <div className="mt-1 text-sm font-black text-slate-950">Formula, jENA, and jSNA evidence</div>
        </div>
        <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.62rem] font-black uppercase text-cyanGlow">
          {passCount}/{protocol.runtimeHandoffs.length}
        </span>
      </div>

      <button
        type="button"
        data-testid="export-stats-method-protocol"
        onClick={onExportMethodProtocol}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        <FileText className="h-4 w-4" /> Export method protocol
      </button>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Runtime audit" value={protocol.auditSummary.runtimeConsistency.status} />
        <MetricCell label="Fusion math" value={protocol.auditSummary.fusionMath.status} />
      </div>

      <div className="grid gap-2">
        {protocol.runtimeHandoffs.map((handoff) => (
          <div
            key={handoff.id}
            data-testid={`method-protocol-handoff-${handoff.id}`}
            data-status={handoff.status}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-black text-slate-950">{handoff.label}</div>
                <div className="mt-1 truncate font-semibold text-slate-500">{`${handoff.source} -> ${handoff.target}`}</div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-black uppercase",
                  handoff.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
                )}
              >
                {handoff.status}
              </span>
            </div>
            <div className="mt-2 line-clamp-2 font-semibold leading-5 text-slate-500">{handoff.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowRail({ steps, activeId = "workflow-canvas" }: { steps: WorkflowStepState[]; activeId?: string }) {
  return (
    <nav className="grid gap-2" aria-label="SENA research workflow">
      {steps.map((step, index) => (
        <a
          key={step.id}
          href={step.href}
          className={cn(
            "grid grid-cols-[2.25rem_1fr] items-center gap-3 rounded-lg border p-3 transition hover:border-cyanGlow/60 hover:bg-background/45",
            step.id === activeId
              ? "border-cyanGlow/65 bg-cyanGlow/12 text-foreground"
              : step.status === "ready"
                ? "border-emerald-300/35 bg-emerald-300/10"
                : "border-amber-300/35 bg-amber-300/10"
          )}
        >
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-background/45 text-xs font-black text-cyanGlow">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-black text-foreground">{step.label}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-black uppercase",
                  step.status === "ready" ? "border-emerald-300/40 text-emerald-100" : "border-amber-300/40 text-amber-100"
                )}
              >
                {step.statusLabel}
              </span>
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-muted">{step.detail}</div>
          </div>
        </a>
      ))}
    </nav>
  );
}

function WorkspaceRail({
  active,
  onChange
}: {
  active: WorkspaceRailMode;
  onChange: (mode: WorkspaceRailMode) => void;
}) {
  return (
    <nav
      data-testid="sena-workspace-mode-rail"
      data-visual-role="workspace-shell-c3-glass-rail"
      aria-label="SENA workspace modules"
      className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#202427] px-3 py-2 xl:flex-col xl:overflow-visible xl:border-b-0 xl:border-r xl:px-2 xl:py-4"
    >
      {workspaceRailItems.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`workspace-rail-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              "group grid h-[4.125rem] min-w-[3.125rem] place-items-center rounded-2xl border text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_22px_rgb(2_6_23/0.25)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow xl:w-[3.125rem]",
              isActive
                ? "border-cyanGlow/70 bg-cyanGlow/80 text-white"
                : "border-white/12 bg-white/[0.07] text-slate-300 hover:border-white/25 hover:bg-white/[0.11] hover:text-white"
            )}
            aria-pressed={isActive}
            aria-label={`Open ${item.label} workspace panel`}
          >
              <span className="grid w-full justify-items-center gap-1">
                <span className={cn("grid h-7 w-7 place-items-center rounded-xl", isActive ? "bg-white/16" : "bg-white/[0.04]")}>
                <Icon
                  data-testid={`workspace-rail-icon-${item.id}`}
                  data-icon-name={item.iconName}
                  data-visual-role={item.visualRole}
                  className={cn(item.iconName === "network-metrics" || item.iconName === "layer-stack" ? "h-6 w-6" : "h-5 w-5")}
                  strokeWidth={2.2}
                />
              </span>
              <span className="max-w-[3rem] text-[0.62rem] font-black leading-tight">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PlotSwitcher({
  active,
  isOpen,
  onToggle,
  onSelect
}: {
  active: SenaPlotView;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (view: SenaPlotView) => void;
}) {
  const selected = plotViewOptions.find((option) => option.id === active) ?? plotViewOptions[0];
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="workspace-plot-switcher"
        data-visual-role="workspace-shell-collapsed-plot-switcher"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex h-11 min-w-[16rem] items-center justify-between gap-3 rounded-full border border-slate-300/80 bg-white/90 px-4 text-left shadow-[0_8px_24px_rgb(15_23_42/0.08)] transition hover:border-cyanGlow/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="flex items-center gap-3">
          <span className="grid grid-cols-2 gap-1">
            <span className="h-2 w-2 rounded-[0.2rem] bg-cyanGlow" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-violetGlow" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-blue-500" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-fuchsia-400" />
          </span>
          <span className="text-sm font-black text-slate-900">Plots</span>
          <span className="text-xs font-black text-slate-500">{selected.label}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-cyanGlow/25 bg-cyanGlow/10 text-xs font-black text-cyanGlow">{plotViewOptions.length}</span>
          <ChevronDown className={cn("h-4 w-4 text-cyanGlow transition", isOpen && "rotate-180")} />
        </span>
      </button>
      {isOpen && (
        <div
          data-testid="workspace-plot-switcher-menu"
          className="absolute right-0 top-12 z-30 grid w-72 gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_18px_42px_rgb(15_23_42/0.18)]"
        >
          {plotViewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`workspace-plot-view-${option.id}`}
              data-plot-view={option.id}
              onClick={() => onSelect(option.id)}
              className={cn(
                "grid rounded-xl px-3 py-2 text-left transition",
                active === option.id ? "bg-cyanGlow/15 text-slate-950" : "hover:bg-slate-100"
              )}
            >
              <span className="text-sm font-black">{option.label}</span>
              <span className="text-xs font-semibold text-slate-500">{option.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivePlotViewToolbar({
  active,
  isOpen,
  onToggle,
  onSelect,
  className
}: {
  active: SenaPlotView;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (view: SenaPlotView) => void;
  className?: string;
}) {
  return (
    <div
      data-testid="central-active-view-toolbar"
      data-visual-role="central-plot-view-toolbar"
      className={cn("flex flex-col gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between", className)}
    >
      <div className="min-w-0 text-sm">
        <span className="font-black text-slate-950">Active view</span>
        <span className="ml-3 font-black text-cyanGlow">{plotViewOptions.find((option) => option.id === active)?.label}</span>
        <span className="ml-3 hidden font-bold text-slate-500 md:inline">Current temporal window, synchronized with A1 Fusion and evidence inspection</span>
      </div>
      <PlotSwitcher
        active={active}
        isOpen={isOpen}
        onToggle={onToggle}
        onSelect={onSelect}
      />
    </div>
  );
}

function WorkspaceViewportPanel({
  id,
  testId,
  visualRole,
  title,
  children,
  className
}: {
  id?: string;
  testId?: string;
  visualRole?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      data-visual-role={visualRole}
      className={cn("min-w-0 overflow-hidden border border-slate-300/70 bg-white shadow-[0_10px_26px_rgb(15_23_42/0.14)]", className)}
    >
      <div className="flex h-9 items-center justify-between bg-[#d7d7d7] px-4 text-sm font-black uppercase tracking-[0.01em] text-[#757575]">
        <span>{title}</span>
      </div>
      <div className="min-w-0 p-3">
        {children}
      </div>
    </section>
  );
}

function WorkspaceShellPanel({
  id,
  testId,
  visualRole,
  defaultPlotView,
  plotScope,
  title,
  action,
  children,
  className
}: {
  id?: string;
  testId?: string;
  visualRole?: string;
  defaultPlotView?: string;
  plotScope?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      data-visual-role={visualRole}
      data-default-plot-view={defaultPlotView}
      data-plot-scope={plotScope}
      className={cn("min-w-0 scroll-mt-24 border border-slate-300/70 bg-white shadow-[0_10px_26px_rgb(15_23_42/0.1)]", className)}
    >
      <div className="flex h-9 items-center justify-between bg-[#d7d7d7] px-4 text-sm font-black uppercase text-[#757575]">
        <span>{title}</span>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-w-0 p-4">
        {children}
      </div>
    </section>
  );
}

function WorkspaceToolSection({
  testId,
  title,
  detail,
  children
}: {
  testId: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      data-visual-role="webena-plot-tools-section"
      className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3"
    >
      <div>
        <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-slate-500">{title}</div>
        <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{detail}</div>
      </div>
      {children}
    </section>
  );
}

function WorkspaceSecondaryDrawer({
  testId,
  visualRole,
  title,
  detail,
  isOpen,
  onToggle,
  children
}: {
  testId: string;
  visualRole: string;
  title: string;
  detail: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      data-visual-role={visualRole}
      data-open={String(isOpen)}
      className="overflow-hidden rounded border border-slate-300 bg-white"
    >
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-[#252525] px-3 py-2 text-left text-white transition hover:bg-[#303030] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="min-w-0">
          <span className="block text-[0.68rem] font-black uppercase tracking-[0.1em]">{title}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white/62">{detail}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#56b09d] transition", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div data-testid={`${testId}-content`} className="grid gap-3 border-t border-[#56b09d] bg-slate-50 p-3">
          {children}
        </div>
      )}
    </section>
  );
}

function WorkspaceDataViewDrawer({
  model,
  activeWindow,
  isOpen,
  onToggle
}: {
  model: SenaModel;
  activeWindow?: SenaTemporalWindow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const peopleById = new Map(model.people.map((person) => [person.id, person]));
  const codeById = new Map(model.codes.map((code) => [code.id, code]));
  const sortByTurn = <T extends { turnIndex?: number }>(a: T, b: T) => {
    return (a.turnIndex ?? Number.MAX_SAFE_INTEGER) - (b.turnIndex ?? Number.MAX_SAFE_INTEGER);
  };
  const utterances = [...model.dataset.utterances].sort((a, b) => sortByTurn(a, b) || a.id.localeCompare(b.id)).slice(0, 24);
  const segments = [...model.dataset.coded_segments].sort((a, b) => sortByTurn(a, b) || a.segmentId.localeCompare(b.segmentId)).slice(0, 24);
  const interactions = [...model.dataset.interactions].sort((a, b) => sortByTurn(a, b) || `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`)).slice(0, 24);
  const windowLabel = activeWindow ? `${activeWindow.label} · Turns ${activeWindow.startTurn}-${activeWindow.endTurn}` : "Full conversation";
  const matrixRows = [
    ["People", model.people.length],
    ["Utterances", model.dataset.utterances.length],
    ["Segments", model.dataset.coded_segments.length],
    ["S ties", model.summary.socialEdges],
    ["W links", model.summary.conceptEdges],
    ["B bridges", model.summary.bridgeEdges]
  ] as const;

  return (
    <div
      data-testid="workspace-data-view-drawer"
      data-visual-role="workspace-bottom-data-view-drawer"
      data-open={String(isOpen)}
      className="mt-5 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_8px_22px_rgb(15_23_42/0.08)]"
    >
      <button
        type="button"
        data-testid="workspace-data-view-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-[#252525] px-4 py-2 text-left text-sm font-black text-white transition hover:bg-[#303030] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-[#56b09d]" />
          <span>Data View</span>
          <span className="hidden truncate text-xs font-semibold text-white/62 md:inline">{windowLabel}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/70">
          {model.dataset.utterances.length} rows
          <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
        </span>
      </button>

      {isOpen && (
        <div data-testid="workspace-data-view-content" className="grid gap-3 border-t border-[#56b09d] bg-slate-50 p-3 text-xs text-slate-700">
          <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-6">
            {matrixRows.map(([label, value]) => (
              <div key={label} className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-slate-500">{label}</div>
                <div className="mt-1 text-base font-black text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 xl:grid-cols-3">
            <div data-testid="workspace-data-view-utterances" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Utterances</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[28rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-24 border-b border-slate-200 px-3 py-2">Speaker</th>
                      <th className="border-b border-slate-200 px-3 py-2">Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utterances.map((utterance) => (
                      <tr key={utterance.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{utterance.turnIndex}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{peopleById.get(utterance.personId)?.label ?? utterance.personId}</td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{utterance.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-testid="workspace-data-view-segments" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Coded Segments</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[30rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-36 border-b border-slate-200 px-3 py-2">Codes</th>
                      <th className="border-b border-slate-200 px-3 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((segment) => (
                      <tr key={segment.segmentId} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{segment.turnIndex}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {segment.codes.map((codeId) => (
                              <span key={codeId} className="rounded bg-cyanGlow/10 px-1.5 py-0.5 font-black text-slate-700">
                                {codeById.get(codeId)?.label ?? codeId}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{segment.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-testid="workspace-data-view-interactions" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Interactions</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[28rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-28 border-b border-slate-200 px-3 py-2">Tie</th>
                      <th className="w-16 border-b border-slate-200 px-3 py-2">W</th>
                      <th className="border-b border-slate-200 px-3 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((interaction, index) => (
                      <tr key={`${interaction.source}-${interaction.target}-${interaction.turnIndex ?? index}`} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{interaction.turnIndex ?? "all"}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">
                          {`${peopleById.get(interaction.source)?.label ?? interaction.source} -> ${peopleById.get(interaction.target)?.label ?? interaction.target}`}
                        </td>
                        <td className="px-3 py-2 font-black text-slate-950">{formatNumber(interaction.weight ?? 1)}</td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{interaction.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FusionPlotZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  testScope,
  className
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  testScope: "central" | "maximized";
  className?: string;
}) {
  const controlClassName = "grid h-7 w-7 place-items-center rounded-full text-slate-700 transition hover:bg-white hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35";
  const safeZoom = clampFusionPlotZoom(zoom);

  return (
    <div
      data-testid={`fusion-plot-${testScope}-zoom-controls`}
      data-visual-role="fusion-plot-zoom-controls"
      className={cn(
        "inline-flex h-7 items-center overflow-hidden rounded-full border border-slate-400/70 bg-white/78 text-[0.68rem] font-black normal-case text-slate-800 shadow-[0_6px_16px_rgb(15_23_42/0.1)]",
        className
      )}
    >
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-out`}
        aria-label="Zoom out Fusion Plot"
        onClick={onZoomOut}
        disabled={safeZoom <= fusionPlotZoomMin}
        className={controlClassName}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-reset`}
        aria-label="Reset Fusion Plot zoom"
        onClick={onReset}
        className="inline-flex h-7 min-w-12 items-center justify-center gap-1 border-x border-slate-300/70 px-2 text-slate-800 transition hover:bg-white hover:text-slate-950"
      >
        <RotateCcw className="h-3 w-3" />
        {formatFusionPlotZoom(safeZoom)}
      </button>
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-in`}
        aria-label="Zoom in Fusion Plot"
        onClick={onZoomIn}
        disabled={safeZoom >= fusionPlotZoomMax}
        className={controlClassName}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CentralFusionAnalysisScope({
  model,
  activeWindow,
  activeIndex,
  windowCount,
  fusionMathAudit,
  activeTransition,
  activeWindowBrief
}: {
  model: SenaModel;
  activeWindow?: SenaTemporalWindow;
  activeIndex: number;
  windowCount: number;
  fusionMathAudit: SenaFusionMathAudit;
  activeTransition?: SenaTemporalRuntimeTrace["transitions"][number];
  activeWindowBrief?: SenaActiveWindowBrief | null;
}) {
  const aFusionFingerprint = fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
  const turns = activeWindow ? `${activeWindow.startTurn}-${activeWindow.endTurn}` : "All";
  const windowLabel = activeWindow?.label ?? "Full conversation";
  const frameLabel = windowCount > 0 ? `${activeIndex + 1}/${windowCount}` : "0/0";
  const transitionLabel = activeTransition ? `${activeTransition.fromLabel} -> ${activeTransition.toLabel}` : "No adjacent window";
  const strongestGPair = [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const evidenceCapsuleRows = [
    {
      id: "S",
      label: "S social tie",
      value: model.summary.strongestSocialTie?.label ?? "No active social tie",
      detail: model.summary.strongestSocialTie ? `scaled ${formatNumber(model.summary.strongestSocialTie.scaledWeight)}` : "current window",
      className: "border-blue-200 bg-blue-50 text-blue-700"
    },
    {
      id: "W",
      label: "W ENA tie",
      value: model.summary.strongestConceptTie?.label ?? "No active ENA tie",
      detail: model.summary.strongestConceptTie ? `scaled ${formatNumber(model.summary.strongestConceptTie.scaledWeight)}` : "current window",
      className: "border-violet-200 bg-violet-50 text-violet-700"
    },
    {
      id: "B",
      label: "B bridge",
      value: model.summary.strongestBridgeTie?.label ?? "No active bridge",
      detail: model.summary.strongestBridgeTie ? `scaled ${formatNumber(model.summary.strongestBridgeTie.scaledWeight)}` : "current window",
      className: "border-cyan-200 bg-cyan-50 text-cyan-700"
    },
    {
      id: "G",
      label: "G pair",
      value: strongestGPair?.label ?? "No active G pair",
      detail: strongestGPair ? `total ${formatNumber(strongestGPair.totalContribution)}` : "current window",
      className: "border-rose-200 bg-rose-50 text-rose-700"
    }
  ];

  return (
    <div
      data-testid="central-fusion-analysis-scope"
      data-visual-role="active-window-fusion-scope"
      data-window-id={activeWindow?.id ?? "full-conversation"}
      data-window-label={windowLabel}
      data-window-turns={turns}
      data-a-fusion-checksum={aFusionFingerprint?.checksum ?? ""}
      data-transition-id={activeTransition?.id ?? ""}
      data-delta-fusion={activeTransition?.delta.fusion ?? ""}
      data-delta-g={activeTransition?.delta.G ?? ""}
      className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_26px_rgb(15_23_42/0.06)]"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Analysis scope</div>
          <div className="mt-1 text-sm font-black text-slate-950">
            Current-window Fusion Plot: <span className="text-cyanGlow">{windowLabel}</span>
          </div>
        </div>
        <div className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1 text-xs font-black text-cyanGlow">
          A_fusion {aFusionFingerprint?.checksum ?? "pending"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCell label="Frame" value={frameLabel} testId="central-fusion-scope-frame" />
        <MetricCell label="Turns" value={turns} testId="central-fusion-scope-turns" />
        <MetricCell label="Utterances" value={model.dataset.utterances.length} testId="central-fusion-scope-utterances" />
        <MetricCell label="Segments" value={model.dataset.coded_segments.length} testId="central-fusion-scope-segments" />
        <MetricCell label="Edges" value={model.edges.length} testId="central-fusion-scope-edges" />
        <MetricCell label="S/W/B" value={`${model.summary.socialEdges}/${model.summary.conceptEdges}/${model.summary.bridgeEdges}`} testId="central-fusion-scope-layer-counts" />
      </div>
      <div
        data-testid="central-fusion-evidence-capsule"
        data-visual-role="current-window-fusion-evidence-capsule"
        className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-slate-500">Current-window Fusion evidence capsule</div>
          <div className="text-xs font-black text-slate-700">S/W/B/G top signals for this active plot</div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
          {evidenceCapsuleRows.map((row) => (
            <div key={row.id} className={cn("min-w-0 rounded-lg border p-3", row.className)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.68rem] font-black uppercase">{row.label}</span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current/20 bg-white/75 text-[0.7rem] font-black">{row.id}</span>
              </div>
              <div className="mt-2 truncate text-sm font-black text-slate-950" title={row.value}>{row.value}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{row.detail}</div>
            </div>
          ))}
        </div>
        <div className="text-xs font-semibold leading-5 text-slate-500">
          Capsule values summarize the strongest observed layer signals in the current temporal window; they are inspection cues, not causal claims.
        </div>
      </div>
      {activeWindowBrief && (
        <div
          data-testid="central-active-window-brief"
          data-visual-role="active-window-interpretation-brief"
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
        >
          <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-amber-700">Active-window interpretation brief</div>
              <div className="mt-1 text-sm font-black leading-5 text-slate-950">{activeWindowBrief.headline}</div>
            </div>
            <span className="w-fit rounded-full border border-amber-300 bg-white px-2 py-1 text-[0.68rem] font-black uppercase text-amber-700">
              {activeWindowBrief.schemaVersion}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {activeWindowBrief.dominantSignals.map((signal) => (
              <div key={signal.layer} className="min-w-0 rounded-lg border border-white/80 bg-white/80 p-2">
                <div className="text-[0.66rem] font-black uppercase text-slate-500">{signal.layer} signal</div>
                <div className="mt-1 truncate text-xs font-black text-slate-950" title={signal.label}>{signal.label}</div>
                <div className="mt-1 text-[0.68rem] font-semibold text-slate-600">
                  rank {signal.fullConversationRank === null ? "NA" : signal.fullConversationRank}; share {signal.fullConversationShare === null ? "NA" : `${formatNumber(signal.fullConversationShare * 100, 0)}%`}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-white/80 bg-white/80 p-2">
              <div className="text-[0.66rem] font-black uppercase text-slate-500">Evidence cues</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                {activeWindowBrief.evidenceCues.slice(0, 2).map((cue) => cue.sourceLabel).join("; ") || "No evidence cues"}
              </div>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/80 p-2">
              <div className="text-[0.66rem] font-black uppercase text-slate-500">Review checks</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                {activeWindowBrief.reviewChecklist.map((item) => `${item.label}: ${item.status}`).join("; ")}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-amber-800">
            {activeWindowBrief.guardrails[1]}
          </div>
        </div>
      )}
      <div
        data-testid="central-fusion-transition-delta"
        data-visual-role="active-window-fusion-transition-delta"
        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-slate-500">Adjacent-window delta</div>
          <div className="text-xs font-black text-slate-700">{transitionLabel}</div>
        </div>
        {activeTransition ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <MetricCell label="Delta S" value={formatDelta(activeTransition.delta.S)} testId="central-fusion-delta-s" />
              <MetricCell label="Delta W" value={formatDelta(activeTransition.delta.W)} testId="central-fusion-delta-w" />
              <MetricCell label="Delta B" value={formatDelta(activeTransition.delta.B)} testId="central-fusion-delta-b" />
              <MetricCell label="Delta G" value={formatDelta(activeTransition.delta.G)} testId="central-fusion-delta-g" />
              <MetricCell label="Delta A_fusion" value={formatDelta(activeTransition.delta.fusion)} testId="central-fusion-delta-a-fusion" />
              <MetricCell label="Active G pairs" value={formatDelta(activeTransition.delta.activeGPairs, 0)} testId="central-fusion-delta-g-pairs" />
            </div>
            <div
              data-testid="central-fusion-delta-g-pair"
              data-visual-role="active-window-fusion-g-pair-driver"
              data-g-pair-from={activeTransition.strongestGPair.from?.label ?? "NA"}
              data-g-pair-to={activeTransition.strongestGPair.to?.label ?? "NA"}
              data-g-pair-changed={String(activeTransition.strongestGPair.changed)}
              className="mt-2 rounded-lg border border-rose-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-black uppercase text-rose-500">Top G pair shift</div>
                  <div className="mt-1 text-sm font-black text-slate-950">
                    {activeTransition.strongestGPair.from?.label ?? "NA"} {"->"} {activeTransition.strongestGPair.to?.label ?? "NA"}
                  </div>
                </div>
                <span className={cn(
                  "rounded-full border px-2 py-1 text-[0.68rem] font-black uppercase",
                  activeTransition.strongestGPair.changed
                    ? "border-rose-300 bg-rose-50 text-rose-600"
                    : "border-slate-300 bg-slate-100 text-slate-600"
                )}>
                  {activeTransition.strongestGPair.changed ? "changed" : "stable"}
                </span>
              </div>
              <div className="mt-2 text-slate-500">
                This identifies the strongest person-code-pair explanation for the adjacent-window change, not a causal driver.
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-500">
            No adjacent temporal transition is available for the current scope.
          </div>
        )}
        <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          Deltas compare adjacent active windows for inspection; they are not causal evidence without temporal design, coding reliability, and human review.
        </div>
      </div>
    </div>
  );
}

function WorkspaceSecondaryComparisonLens({
  currentModel,
  baselineModel,
  activeWindow
}: {
  currentModel: SenaModel;
  baselineModel: SenaModel;
  activeWindow?: SenaTemporalWindow;
}) {
  const currentGTotal = currentModel.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const baselineGTotal = baselineModel.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const currentFusionTotal = matrixTotal(currentModel.matrices.fusion.values);
  const baselineFusionTotal = matrixTotal(baselineModel.matrices.fusion.values);
  const currentTopG = [...currentModel.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const baselineTopG = [...baselineModel.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const comparisonRows = [
    {
      id: "sna-density",
      label: "SNA density",
      current: currentModel.socialReport.graph.density,
      baseline: baselineModel.socialReport.graph.density,
      digits: 2
    },
    {
      id: "social-ties",
      label: "S ties",
      current: currentModel.summary.socialEdges,
      baseline: baselineModel.summary.socialEdges,
      digits: 0
    },
    {
      id: "ena-links",
      label: "W ENA links",
      current: currentModel.summary.conceptEdges,
      baseline: baselineModel.summary.conceptEdges,
      digits: 0
    },
    {
      id: "bridge-links",
      label: "B bridges",
      current: currentModel.summary.bridgeEdges,
      baseline: baselineModel.summary.bridgeEdges,
      digits: 0
    },
    {
      id: "g-total",
      label: "G total",
      current: currentGTotal,
      baseline: baselineGTotal,
      digits: 1
    },
    {
      id: "fusion-total",
      label: "A_fusion",
      current: currentFusionTotal,
      baseline: baselineFusionTotal,
      digits: 1
    }
  ];
  const baselineSocialEdges = rankedWorkspaceEdges(baselineModel, "social");
  const baselineConceptEdges = rankedWorkspaceEdges(baselineModel, "concept");
  const baselineBridgeEdges = rankedWorkspaceEdges(baselineModel, "bridge");
  const baselineGPairs = rankedWorkspaceGPairs(baselineModel);
  const rankingRows: WorkspaceRankingContextRow[] = [
    buildEdgeRankingContextRow({
      id: "top-social-tie",
      label: "Top S",
      layer: "S",
      currentEdge: currentModel.summary.strongestSocialTie,
      baselineEdges: baselineSocialEdges
    }),
    buildEdgeRankingContextRow({
      id: "top-concept-tie",
      label: "Top W",
      layer: "W",
      currentEdge: currentModel.summary.strongestConceptTie,
      baselineEdges: baselineConceptEdges
    }),
    buildEdgeRankingContextRow({
      id: "top-bridge-tie",
      label: "Top B",
      layer: "B",
      currentEdge: currentModel.summary.strongestBridgeTie,
      baselineEdges: baselineBridgeEdges
    }),
    buildGPairRankingContextRow({
      currentPair: currentTopG,
      baselinePairs: baselineGPairs
    })
  ];

  return (
    <div
      data-testid="workspace-secondary-comparison-lens"
      data-visual-role="secondary-plot-current-window-comparison"
      className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Current-window comparison lens</div>
          <div className="mt-1 text-sm font-black text-slate-950">
            {activeWindow ? activeWindow.label : "Full conversation"} vs full conversation
          </div>
        </div>
        <span className="w-fit rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-2 py-1 text-[0.68rem] font-black uppercase text-cyanGlow">
          Secondary Plot
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-[0.68rem]">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-black">Metric</th>
              <th className="px-2 py-1.5 text-right font-black">Window</th>
              <th className="px-2 py-1.5 text-right font-black">Full</th>
              <th className="px-2 py-1.5 text-right font-black">Share</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-2 py-1.5 font-black text-slate-700">{row.label}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-slate-950">{formatNumber(row.current, row.digits)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-slate-600">{formatNumber(row.baseline, row.digits)}</td>
                <td className="px-2 py-1.5 text-right font-black text-cyanGlow">{formatShare(row.current, row.baseline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2">
        <div className="rounded-lg border border-violet-200 bg-white p-2">
          <div className="text-[0.66rem] font-black uppercase text-violet-600">Top ENA W link</div>
          <div className="mt-1 truncate text-xs font-black text-slate-950" title={currentModel.summary.strongestConceptTie?.label ?? "NA"}>
            {currentModel.summary.strongestConceptTie?.label ?? "NA"}
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold text-slate-500">
            full: {baselineModel.summary.strongestConceptTie?.label ?? "NA"}
          </div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-white p-2">
          <div className="text-[0.66rem] font-black uppercase text-rose-600">Top G pair</div>
          <div className="mt-1 truncate text-xs font-black text-slate-950" title={currentTopG?.label ?? "NA"}>
            {currentTopG?.label ?? "NA"}
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold text-slate-500">
            full: {baselineTopG?.label ?? "NA"}
          </div>
        </div>
      </div>

      <div
        data-testid="workspace-secondary-ranking-context"
        data-visual-role="secondary-plot-signal-ranking-context"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-[0.66rem] font-black uppercase text-slate-500">
          Current top signals in full corpus
        </div>
        <table className="w-full text-left text-[0.68rem]">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-black">Layer</th>
              <th className="px-2 py-1.5 font-black">Signal</th>
              <th className="px-2 py-1.5 text-right font-black">Rank</th>
              <th className="px-2 py-1.5 text-right font-black">Full share</th>
            </tr>
          </thead>
          <tbody>
            {rankingRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-2 py-1.5 font-black text-slate-700">{row.layer}</td>
                <td className="max-w-[7.5rem] truncate px-2 py-1.5 font-semibold text-slate-950" title={row.signalLabel}>
                  {row.signalLabel}
                </td>
                <td className="px-2 py-1.5 text-right font-black text-slate-700">{formatRank(row.baselineRank, row.baselineItemCount)}</td>
                <td className="px-2 py-1.5 text-right font-black text-cyanGlow">
                  {row.baselineShare === null ? "NA" : `${formatNumber(row.baselineShare * 100, 0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[0.68rem] font-semibold leading-5 text-slate-500">
        Shares compare the active analysis window with the full source dataset under the same alpha/beta/gamma and normalization settings; they are descriptive, not inferential.
      </div>
    </div>
  );
}

function PilotAssetsPanel({
  isLoadingSample,
  onLoadSample
}: {
  isLoadingSample: boolean;
  onLoadSample: () => void;
}) {
  return (
    <div data-testid="pilot-assets-panel" data-visual-role="pilot-assets-panel" className="rounded-lg border border-cardBorder/45 bg-background/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-foreground">Research Pilot Assets</div>
          <div
            data-testid="pilot-asset-integrity"
            data-visual-role="pilot-asset-integrity"
            className="mt-1 text-xs font-semibold text-muted"
          >
            Templates and sample data match the SENA import aliases with {senaPilotAssetIntegrity.length} manifest fingerprints.
          </div>
        </div>
        <Database className="h-4 w-4 shrink-0 text-cyanGlow" />
      </div>
      <div className="mt-3 grid gap-2">
        <button data-testid="load-lesson-study-sample" type="button" onClick={onLoadSample} disabled={isLoadingSample} className={buttonStyles({ size: "sm", className: "w-full justify-start" })}>
          <Sparkles className="h-4 w-4" /> {isLoadingSample ? "Loading sample..." : "Load lesson-study sample"}
        </button>
        <a
          data-testid="pilot-asset-link"
          data-asset-kind="manifest"
          data-asset-href={senaPilotPackageManifestAsset.href}
          href={senaPilotPackageManifestAsset.href}
          download
          className={buttonStyles({ variant: "secondary", size: "sm", className: "w-full justify-start" })}
        >
          <Download className="h-4 w-4" /> {senaPilotPackageManifestAsset.label}
        </a>
        <div className="rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-3" data-testid="pilot-handoff-checks" data-visual-role="pilot-handoff-checks">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase text-cyanGlow">Handoff checks</div>
            <span className="text-[0.64rem] font-black uppercase text-muted">manifest aligned</span>
          </div>
          <div className="grid gap-2">
            {senaPilotHandoffChecks.map((check) => (
              <div
                key={check.id}
                data-testid="pilot-handoff-check"
                data-handoff-check-id={check.id}
                data-handoff-artifact={check.artifact}
                className="rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-foreground">{check.label}</span>
                  <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.62rem] font-black text-cyanGlow">
                    {check.artifact}
                  </span>
                </div>
                <div className="mt-1 text-[0.68rem] font-semibold leading-5 text-muted">
                  {check.expectedEvidence.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs font-black uppercase text-muted">Sample dataset</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {senaPilotSampleAssets.map((asset) => (
            <a
              key={asset.href}
              data-testid="pilot-asset-link"
              data-asset-kind="sample"
              data-asset-href={asset.href}
              href={asset.href}
              download
              className="grid rounded-lg border border-cardBorder/40 bg-background/35 px-3 py-2 transition hover:border-cyanGlow/55"
            >
              <span className="text-xs font-black text-foreground">{asset.label}</span>
              <span className="mt-0.5 text-[0.68rem] font-semibold text-muted">{asset.detail}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="mt-3 border-t border-cardBorder/30 pt-3">
        <div className="mb-2 text-xs font-black uppercase text-muted">Blank templates</div>
        <div className="grid gap-2">
          {senaPilotTemplateAssets.map((asset) => (
            <a
              key={asset.href}
              data-testid="pilot-asset-link"
              data-asset-kind="template"
              data-asset-href={asset.href}
              href={asset.href}
              download
              className="grid rounded-lg border border-cardBorder/35 bg-background/25 px-3 py-2 transition hover:border-cyanGlow/50"
            >
              <span className="text-xs font-black text-foreground">{asset.label}</span>
              <span className="mt-0.5 text-[0.68rem] font-semibold text-muted">{asset.detail}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  testId,
  onChange
}: {
  label: string;
  value: number;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-black text-foreground">{label}</span>
        <span className="font-semibold text-muted">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-2 accent-cyanGlow"
        data-testid={testId}
      />
    </label>
  );
}

function IntegerControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          const fallback = Number.isFinite(parsed) ? parsed : min;
          onChange(Math.max(min, Math.min(max, Math.round(fallback / step) * step)));
        }}
        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-black text-foreground outline-none focus:border-cyanGlow"
      />
    </label>
  );
}

function MappingSelect({
  label,
  value,
  columns,
  required,
  onChange
}: {
  label: string;
  value: string;
  columns: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      <span className="flex items-center justify-between gap-2">
        {label}
        {required && <span className="text-[0.65rem] font-black uppercase text-cyanGlow">Required</span>}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
      >
        <option value="">Unmapped</option>
        {columns.map((column) => (
          <option key={column} value={column}>{column}</option>
        ))}
      </select>
    </label>
  );
}

function UploadedTableMapper({
  table,
  onTableChange,
  onFieldChange
}: {
  table: UploadedSenaTable;
  onTableChange: (table: SenaImportTable) => void;
  onFieldChange: (field: string, column: string) => void;
}) {
  const missing = missingRequiredSenaFields(table.table, table.mapping);

  return (
    <div className="rounded-lg border border-cardBorder/45 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-foreground">{table.name}</div>
          <div className="mt-1 text-xs font-semibold text-muted">{table.rows.length} rows, {table.columns.length} columns</div>
        </div>
        {missing.length === 0 ? (
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyanGlow" />
        ) : (
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
        )}
      </div>

      <label className="mt-3 grid gap-1 text-xs font-bold text-muted">
        Contract table
        <select
          value={table.table}
          onChange={(event) => onTableChange(event.currentTarget.value as SenaImportTable)}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          {senaImportTables.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      {missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-100">
          Missing {missing.map((field) => field.label).join(", ")}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {senaImportFields[table.table].map((field) => (
          <MappingSelect
            key={field.field}
            label={field.label}
            required={field.required}
            value={table.mapping[field.field] ?? ""}
            columns={table.columns}
            onChange={(column) => onFieldChange(field.field, column)}
          />
        ))}
      </div>
    </div>
  );
}

function MatrixPreview({
  title,
  rowLabels,
  columnLabels,
  values
}: {
  title: string;
  rowLabels: string[];
  columnLabels: string[];
  values: number[][];
}) {
  const rows = values.slice(0, 6);
  const columns = columnLabels.slice(0, 6);

  return (
    <div className="overflow-hidden rounded-lg border border-cardBorder/45 bg-background/30">
      <div className="border-b border-cardBorder/35 px-3 py-2 text-sm font-black text-foreground">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-muted">
              <th className="px-3 py-2 font-black">Layer</th>
              {columns.map((label) => (
                <th key={label} className="px-3 py-2 font-black">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowLabels[rowIndex]} className="border-t border-cardBorder/20">
                <td className="whitespace-nowrap px-3 py-2 font-black text-foreground">{rowLabels[rowIndex]}</td>
                {columns.map((_, columnIndex) => (
                  <td key={columnIndex} className="px-3 py-2 text-foreground/78">{formatNumber(row[columnIndex] ?? 0, 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const temporalFusionPhases = [
  {
    label: "Plan",
    subtitle: "Question + hypothesis",
    match: /(plan|brainstorm|question|hypothesis|forming)/i,
    tint: "#dbeafe"
  },
  {
    label: "Teach",
    subtitle: "Evidence building",
    match: /(teach|evidence|build|lesson|inquiry)/i,
    tint: "#e0f7ff"
  },
  {
    label: "Reflect",
    subtitle: "Explanation + reflection",
    match: /(reflect|reflection|explain|synthesis|review)/i,
    tint: "#f4e8ff"
  }
] as const;

function temporalPhaseIndex(window: SenaTemporalWindow, index: number, total: number) {
  const source = `${window.label} ${window.stages.join(" ")}`;
  const matched = temporalFusionPhases.findIndex((phase) => phase.match.test(source));
  if (matched >= 0) return matched;
  return Math.min(temporalFusionPhases.length - 1, Math.floor((index / Math.max(1, total)) * temporalFusionPhases.length));
}

function truncateSvgText(value: string, maxLength = 13) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}.` : value;
}

function TemporalFusionArc({
  windows,
  activeIndex,
  people,
  codes,
  temporalRuntimeTrace,
  onSelect
}: {
  windows: SenaTemporalWindow[];
  activeIndex: number;
  people: SenaModel["people"];
  codes: SenaModel["codes"];
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  onSelect: (index: number) => void;
}) {
  const chartWidth = 760;
  const chartHeight = 360;
  const activeWindow = windows[activeIndex];
  const codeColor = new Map(codes.map((code) => [code.id, code.color]));
  const codeLabel = new Map(codes.map((code) => [code.id, code.label]));
  const traceByWindowId = new Map((temporalRuntimeTrace?.windows ?? []).map((entry) => [entry.window.id, entry]));
  const gTotals = windows.map((window) => traceByWindowId.get(window.id)?.sena.matrixTotals.G ?? 0);
  const gTotalMax = Math.max(1, ...gTotals);
  const gForWindow = (window?: SenaTemporalWindow) => {
    if (!window) return { normalized: 0, total: 0, activePairs: 0, strongestPair: undefined };
    const entry = traceByWindowId.get(window.id);
    const total = entry?.sena.matrixTotals.G ?? 0;
    return {
      normalized: total / gTotalMax,
      total,
      activePairs: entry?.sena.activeGPairs ?? 0,
      strongestPair: entry?.sena.strongestGPair
    };
  };
  const personInitials = new Map(people.map((person) => {
    const fallback = person.label.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
    return [person.id, person.initials ?? (fallback || person.id.slice(0, 2).toUpperCase())];
  }));

  if (windows.length === 0) {
    return (
      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
        Temporal Fusion Arc will appear when stage or turn windows are available.
      </div>
    );
  }

  const phaseGroups = temporalFusionPhases.map((phase, phaseIndex) => ({
    ...phase,
    index: phaseIndex,
    x: 130 + phaseIndex * 250,
    windows: windows
      .map((window, windowIndex) => ({ window, windowIndex }))
      .filter(({ window, windowIndex }) => temporalPhaseIndex(window, windowIndex, windows.length) === phaseIndex)
  }));

  const activePhaseIndex = activeWindow ? temporalPhaseIndex(activeWindow, activeIndex, windows.length) : 0;
  const phaseConcepts = phaseGroups.map((phase) => {
    const scores = new Map<string, { label: string; weight: number; color: string }>();
    for (const { window } of phase.windows) {
      for (const code of window.topCodes) {
        const current = scores.get(code.id);
        scores.set(code.id, {
          label: codeLabel.get(code.id) ?? code.label,
          weight: Math.max(current?.weight ?? 0, code.weight),
          color: codeColor.get(code.id) ?? "#8b5cf6"
        });
      }
    }
    return Array.from(scores.values()).sort((a, b) => b.weight - a.weight).slice(0, 2);
  });

  const phaseActors = phaseGroups.map((phase) => {
    const counts = new Map<string, number>();
    for (const { window } of phase.windows) {
      for (const snippet of window.evidence) {
        if (!snippet.personId) continue;
        counts.set(snippet.personId, (counts.get(snippet.personId) ?? 0) + 1);
      }
    }
    const [personId] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
    return personId ? personInitials.get(personId) ?? personId.slice(0, 2).toUpperCase() : "";
  });

  const conceptNodes = phaseGroups.flatMap((phase, phaseIndex) => {
    const concepts = phaseConcepts[phaseIndex];
    const fallbackLabel = phaseIndex === 0 ? "Question" : phaseIndex === 1 ? "Evidence" : "Reflection";
    const rows = concepts.length > 0 ? concepts : [{ label: fallbackLabel, weight: 0, color: phaseIndex === 2 ? "#e253a5" : "#8b5cf6" }];
    return rows.map((concept, conceptIndex) => ({
      ...concept,
      phaseIndex,
      x: phase.x + (conceptIndex === 0 ? -32 : 32),
      y: conceptIndex === 0 ? 145 : 216,
      radius: 35 + Math.min(9, Math.max(0, concept.weight) * 0.8)
    }));
  });

  const representativeIndex = (phaseIndex: number) => {
    const activeInPhase = phaseGroups[phaseIndex].windows.find(({ windowIndex }) => windowIndex === activeIndex);
    return activeInPhase?.windowIndex ?? phaseGroups[phaseIndex].windows[0]?.windowIndex ?? 0;
  };
  const phaseSummaries = phaseGroups.map((phase) => {
    const windowIndex = representativeIndex(phase.index);
    const window = windows[windowIndex];
    return {
      phase,
      window,
      windowIndex,
      evidenceCount: phase.windows.reduce((total, entry) => total + entry.window.evidence.length, 0)
    };
  });

  return (
    <div data-testid="temporal-fusion-arc" className="overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.75)]">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">Temporal Fusion Arc</div>
          <div className="mt-1 text-xs font-semibold text-slate-600">Plan - Teach - Reflect story view linked to the active temporal window.</div>
        </div>
        <div className="flex flex-wrap gap-2 text-[0.68rem] font-black text-slate-600">
          <span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-2 py-1">S social spine</span>
          <span className="rounded-full border border-violetGlow/25 bg-violetGlow/10 px-2 py-1">W concept transitions</span>
          <span className="rounded-full border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1">B bridge moments</span>
          <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-1">G pair contributions</span>
          <span className="rounded-full border border-rose-200/20 bg-rose-300/8 px-2 py-1">Top G pair</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[22rem] w-full" role="img" aria-label="Temporal Fusion Arc Plan Teach Reflect">
        <defs>
          <linearGradient id="temporal-bridge-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#24dcee" />
            <stop offset="100%" stopColor="#7aa7ff" />
          </linearGradient>
          <linearGradient id="temporal-concept-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#735cf6" />
            <stop offset="100%" stopColor="#b14cf1" />
          </linearGradient>
          <linearGradient id="temporal-g-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e253a5" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="12" fill="#ffffff" />
        {phaseGroups.map((phase) => (
          <g key={phase.label} onClick={() => onSelect(representativeIndex(phase.index))} className="cursor-pointer">
            <rect
              x={phase.x - 106}
              y="34"
              width="212"
              height="282"
              rx="22"
              fill={phase.tint}
              opacity={phase.index === activePhaseIndex ? 0.72 : 0.42}
              stroke={phase.index === activePhaseIndex ? "#24dcee" : "#cbd5e1"}
              strokeWidth={phase.index === activePhaseIndex ? 1.8 : 1}
            />
            <text x={phase.x} y="64" textAnchor="middle" fill="#0f172a" fontSize="20" fontWeight="950">
              {phase.label}
            </text>
            <text x={phase.x} y="84" textAnchor="middle" fill="#475569" fontSize="10" fontWeight="900">
              {phase.subtitle.toUpperCase()}
            </text>
            <title>{`${phase.label}: ${phase.windows.map(({ window }) => window.label).join(", ") || "no windows"}`}</title>
          </g>
        ))}

        <path d="M 90 274 C 220 92 415 92 670 274" fill="none" stroke="#2f73ff" strokeWidth="5.5" strokeLinecap="round" opacity="0.72" />
        <path d="M 104 260 C 250 200 485 200 656 260" fill="none" stroke="url(#temporal-bridge-gradient)" strokeWidth="9" strokeLinecap="round" opacity="0.34" />
        <path d="M 130 216 C 270 130 510 130 630 216" fill="none" stroke="url(#temporal-concept-gradient)" strokeWidth="4.5" strokeLinecap="round" opacity="0.62" />
        <path
          data-visual-role="temporal-g-pair-arc"
          d="M 122 286 C 260 322 492 322 638 286"
          fill="none"
          stroke="url(#temporal-g-gradient)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.58"
        />

        {conceptNodes.slice(0, -1).map((node, index) => {
          const next = conceptNodes[index + 1];
          return (
            <path
              key={`${node.label}-${index}`}
              d={`M ${node.x} ${node.y} L ${next.x} ${next.y}`}
              fill="none"
              stroke="url(#temporal-concept-gradient)"
              strokeWidth="2.8"
              strokeLinecap="round"
              opacity="0.42"
            />
          );
        })}

        {conceptNodes.map((node, index) => {
          const active = node.phaseIndex === activePhaseIndex;
          return (
            <g key={`${node.phaseIndex}-${node.label}-${index}`}>
              <polygon
                points={hexPoints(node.x, node.y, node.radius)}
                fill={node.color}
                opacity={active ? 0.96 : 0.78}
                stroke={active ? "#ffffff" : "rgb(var(--background))"}
                strokeWidth={active ? 3 : 1.8}
              />
              <text x={node.x} y={node.y + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="950">
                {truncateSvgText(node.label)}
              </text>
              <title>{`${node.label}: W ${formatNumber(node.weight, 1)}`}</title>
            </g>
          );
        })}

        {phaseGroups.map((phase, index) => {
          const actor = phaseActors[index];
          if (!actor) return null;
          return (
            <g key={`${phase.label}-actor`}>
              <line x1={phase.x} y1="252" x2={phase.x} y2="292" stroke="#24dcee" strokeWidth="6" strokeLinecap="round" opacity="0.28" />
              <circle cx={phase.x} cy="292" r="24" fill="#f8fbff" stroke="#24dcee" strokeWidth="2.4" />
              <text x={phase.x} y="299" textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="950">
                {actor}
              </text>
            </g>
          );
        })}

        {phaseGroups.map((phase) => {
          const representative = phase.windows.find(({ windowIndex }) => windowIndex === activeIndex)?.window ?? phase.windows[0]?.window;
          const y = 336;
          const socialWidth = Math.max(8, Math.min(54, (representative?.socialConnectivity ?? 0) * 54));
          const conceptWidth = Math.max(8, Math.min(54, (representative?.conceptConnectivity ?? 0) * 54));
          const bridgeWidth = Math.max(8, Math.min(54, (representative?.bridgeIntegration ?? 0) * 54));
          const gMetric = gForWindow(representative);
          const gWidth = Math.max(8, Math.min(54, gMetric.normalized * 54));
          return (
            <g key={`${phase.label}-metrics`}>
              <rect x={phase.x - 60} y={y - 34} width="120" height="52" rx="10" fill="#f8fafc" stroke="#cbd5e1" />
              <line x1={phase.x - 48} x2={phase.x - 48 + socialWidth} y1={y - 17} y2={y - 17} stroke="#2f73ff" strokeWidth="4" strokeLinecap="round" />
              <line x1={phase.x - 48} x2={phase.x - 48 + conceptWidth} y1={y - 7} y2={y - 7} stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
              <line x1={phase.x - 48} x2={phase.x - 48 + bridgeWidth} y1={y + 3} y2={y + 3} stroke="#24dcee" strokeWidth="4" strokeLinecap="round" />
              <line
                data-visual-role="temporal-g-pair-metric"
                x1={phase.x - 48}
                x2={phase.x - 48 + gWidth}
                y1={y + 13}
                y2={y + 13}
                stroke="#fb7185"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <title>{`${phase.label} G pair contributions: total ${formatNumber(gMetric.total, 1)}, active pairs ${gMetric.activePairs}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="grid gap-2 border-t border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
        {phaseSummaries.map(({ phase, window, windowIndex, evidenceCount }) => {
          const active = phase.index === activePhaseIndex;
          const gMetric = gForWindow(window);
          return (
            <button
              key={phase.label}
              type="button"
              data-testid={`temporal-fusion-phase-${phase.label.toLowerCase()}`}
              aria-pressed={active}
              onClick={() => onSelect(windowIndex)}
              className={cn(
                "grid gap-1 rounded-lg border px-3 py-2 text-left transition",
                active ? "border-cyanGlow/65 bg-cyanGlow/12 text-slate-950" : "border-slate-200 bg-white text-slate-600 hover:border-cyanGlow/45 hover:text-slate-950"
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-black uppercase">
                {phase.label}
                {active && <span className="rounded-full border border-cyanGlow/35 px-2 py-0.5 text-[0.62rem] text-cyanGlow">Active</span>}
              </span>
              <span className="truncate text-sm font-black">{window?.label ?? "No window"}</span>
              <span className="text-xs font-semibold">
                {window ? `Turns ${window.startTurn}-${window.endTurn} · ${evidenceCount} evidence refs` : "No temporal evidence yet"}
              </span>
              <span className="text-xs font-semibold text-rose-600">
                {window ? `${gMetric.activePairs} G pairs · G ${formatNumber(gMetric.total, 1)}` : "No G pair contributions yet"}
              </span>
              <span className="truncate text-xs font-semibold text-slate-500">
                {gMetric.strongestPair ? `Top G pair: ${gMetric.strongestPair.label}` : "Top G pair: NA"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineTrace({
  windows,
  activeIndex,
  temporalRuntimeTrace,
  onSelect
}: {
  windows: SenaTemporalWindow[];
  activeIndex: number;
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  onSelect: (index: number) => void;
}) {
  const chartWidth = 420;
  const chartHeight = 150;

  if (windows.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">No temporal windows yet.</div>;
  }

  type TemporalMetric = "socialConnectivity" | "conceptConnectivity" | "bridgeIntegration";
  const traceByWindowId = new Map((temporalRuntimeTrace?.windows ?? []).map((entry) => [entry.window.id, entry]));
  const gTotals = windows.map((window) => traceByWindowId.get(window.id)?.sena.matrixTotals.G ?? 0);
  const gTotalMax = Math.max(1, ...gTotals);
  const xFor = (index: number) => 32 + (index * (chartWidth - 64)) / Math.max(1, windows.length - 1);
  const yFor = (value: number) => chartHeight - 24 - Math.max(0, Math.min(1, value)) * (chartHeight - 50);
  const pathFor = (key: TemporalMetric) =>
    windows.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[key])}`).join(" ");
  const pathForG = () =>
    windows.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor((traceByWindowId.get(point.id)?.sena.matrixTotals.G ?? 0) / gTotalMax)}`).join(" ");
  const labelFor = (point: SenaTemporalWindow) => {
    if (point.mode === "stage") return point.label.slice(0, 10);
    if (point.mode === "turn-window") return `${point.centerTurn ?? point.startTurn}`;
    return `${point.startTurn}-${point.endTurn}`;
  };

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full" role="img" aria-label="Temporal SENA trace">
      {[0.25, 0.5, 0.75].map((step) => (
        <line key={step} x1="26" x2={chartWidth - 26} y1={yFor(step)} y2={yFor(step)} stroke="rgb(var(--foreground) / 0.10)" />
      ))}
      <path d={pathFor("socialConnectivity")} fill="none" stroke="#2f73ff" strokeWidth="4" strokeLinecap="round" />
      <path d={pathFor("conceptConnectivity")} fill="none" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
      <path d={pathFor("bridgeIntegration")} fill="none" stroke="#24dcee" strokeWidth="4" strokeLinecap="round" />
      <path data-visual-role="temporal-trace-g-pair-line" d={pathForG()} fill="none" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" />
      {windows.map((point, index) => (
        <g key={point.id} onClick={() => onSelect(index)} className="cursor-pointer">
          {index === activeIndex && (
            <line x1={xFor(index)} x2={xFor(index)} y1="16" y2={chartHeight - 20} stroke="rgb(var(--foreground) / 0.22)" strokeDasharray="4 6" />
          )}
          <circle cx={xFor(index)} cy={yFor(point.socialConnectivity)} r="4" fill="#2f73ff" />
          <circle cx={xFor(index)} cy={yFor(point.conceptConnectivity)} r="4" fill="#a855f7" />
          <circle cx={xFor(index)} cy={yFor(point.bridgeIntegration)} r="4" fill="#24dcee" />
          <circle cx={xFor(index)} cy={yFor(gTotals[index] / gTotalMax)} r="4" fill="#fb7185" />
          {index === activeIndex && (
            <circle cx={xFor(index)} cy={yFor(point.bridgeIntegration)} r="8" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          )}
          <text x={xFor(index)} y={chartHeight - 4} textAnchor="middle" fill="rgb(var(--muted))" fontSize="11" fontWeight="800">
            {labelFor(point)}
          </text>
          <title>{`${point.label}: turns ${point.startTurn}-${point.endTurn}`}</title>
        </g>
      ))}
    </svg>
  );
}

function TemporalWindowBuilder({
  mode,
  onModeChange,
  movingWindowSize,
  onMovingWindowSizeChange,
  movingWindowStep,
  onMovingWindowStepChange,
  turnWindowRadius,
  onTurnWindowRadiusChange,
  windows,
  people,
  codes,
  temporalRuntimeTrace,
  activeIndex,
  onActiveIndexChange,
  isAnimating,
  onAnimationToggle,
  animationMs,
  onAnimationMsChange
}: {
  mode: SenaTemporalMode;
  onModeChange: (mode: SenaTemporalMode) => void;
  movingWindowSize: number;
  onMovingWindowSizeChange: (value: number) => void;
  movingWindowStep: number;
  onMovingWindowStepChange: (value: number) => void;
  turnWindowRadius: number;
  onTurnWindowRadiusChange: (value: number) => void;
  windows: SenaTemporalWindow[];
  people: SenaModel["people"];
  codes: SenaModel["codes"];
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  isAnimating: boolean;
  onAnimationToggle: () => void;
  animationMs: number;
  onAnimationMsChange: (value: number) => void;
}) {
  const activeWindow = windows[activeIndex];
  const activeTraceEntry = activeWindow ? temporalRuntimeTrace.windows.find((entry) => entry.window.id === activeWindow.id) : undefined;
  const activeTransition = activeWindow
    ? temporalRuntimeTrace.transitions.find((transition) => transition.toWindowId === activeWindow.id) ??
      temporalRuntimeTrace.transitions.find((transition) => transition.fromWindowId === activeWindow.id)
    : undefined;
  const lastIndex = Math.max(0, windows.length - 1);
  const canAnimate = windows.length > 1;
  const goTo = (index: number) => onActiveIndexChange(Math.max(0, Math.min(lastIndex, index)));
  const PlaybackIcon = isAnimating ? Pause : Play;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        {temporalModeOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            data-testid={`temporal-mode-${item.value}`}
            aria-pressed={mode === item.value}
            onClick={() => onModeChange(item.value)}
            className={cn(
              "h-10 rounded-lg border px-3 text-sm font-black transition",
              mode === item.value ? "border-cyanGlow/65 bg-cyanGlow/14 text-foreground" : "border-cardBorder/45 bg-background/30 text-muted hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {mode === "moving-window" && (
          <>
            <IntegerControl label="Window size" value={movingWindowSize} min={1} max={12} onChange={onMovingWindowSizeChange} />
            <IntegerControl label="Step" value={movingWindowStep} min={1} max={12} onChange={onMovingWindowStepChange} />
          </>
        )}
        {mode === "turn-window" && (
          <IntegerControl label="Turn radius" value={turnWindowRadius} min={0} max={8} onChange={onTurnWindowRadiusChange} />
        )}
        <IntegerControl label="Frame ms" value={animationMs} min={400} max={5000} step={100} onChange={onAnimationMsChange} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cardBorder/35 bg-background/25 p-2">
        <button
          type="button"
          title="Previous window"
          aria-label="Previous temporal window"
          disabled={!canAnimate || activeIndex === 0}
          onClick={() => goTo(activeIndex - 1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cardBorder/45 bg-background/40 text-foreground transition hover:border-cyanGlow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={isAnimating ? "Pause animation" : "Play animation"}
          aria-label={isAnimating ? "Pause temporal animation" : "Play temporal animation"}
          disabled={!canAnimate}
          onClick={onAnimationToggle}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cyanGlow/55 bg-cyanGlow/12 text-cyanGlow transition hover:bg-cyanGlow/18 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlaybackIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Next window"
          aria-label="Next temporal window"
          disabled={!canAnimate || activeIndex === lastIndex}
          onClick={() => goTo(activeIndex + 1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cardBorder/45 bg-background/40 text-foreground transition hover:border-cyanGlow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <input
          type="range"
          min="0"
          max={lastIndex}
          value={Math.min(activeIndex, lastIndex)}
          disabled={windows.length === 0}
          onChange={(event) => goTo(Number(event.currentTarget.value))}
          data-testid="temporal-window-slider"
          className="min-w-44 flex-1 accent-cyanGlow"
        />
        <div className="min-w-16 text-right text-xs font-black text-muted">
          {windows.length > 0 ? `${activeIndex + 1}/${windows.length}` : "0/0"}
        </div>
      </div>

      <TemporalFusionArc windows={windows} activeIndex={activeIndex} people={people} codes={codes} temporalRuntimeTrace={temporalRuntimeTrace} onSelect={goTo} />

      <TimelineTrace windows={windows} activeIndex={activeIndex} temporalRuntimeTrace={temporalRuntimeTrace} onSelect={goTo} />

      <div className="grid gap-2 text-xs font-semibold text-muted">
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#2f73ff]" /> Social connectivity</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#a855f7]" /> Concept connectivity</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#24dcee]" /> Social-epistemic integration</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#fb7185]" /> G pair contribution</div>
      </div>

      {activeWindow ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCell label="Window" value={activeWindow.label} />
            <MetricCell label="Turns" value={`${activeWindow.startTurn}-${activeWindow.endTurn}`} />
            <MetricCell label="Segments" value={activeWindow.segmentCount} />
            <MetricCell label="Evidence" value={activeWindow.evidence.length} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCell label="Raw social" value={formatNumber(activeWindow.rawSocialConnectivity, 1)} />
            <MetricCell label="Raw concept" value={formatNumber(activeWindow.rawConceptConnectivity, 1)} />
            <MetricCell label="Raw bridge" value={formatNumber(activeWindow.rawBridgeIntegration, 1)} />
            <MetricCell label="Raw G pairs" value={formatNumber(activeTraceEntry?.sena.matrixTotals.G ?? 0, 1)} />
          </div>
          {activeTraceEntry?.sena.strongestGPair && (
            <div className="rounded-lg border border-rose-300/25 bg-rose-400/8 p-3 text-sm font-semibold leading-6 text-foreground/86">
              <div className="text-xs font-black uppercase text-rose-200">Top G pair in this window</div>
              <div className="mt-1 font-black text-foreground">{activeTraceEntry.sena.strongestGPair.label}</div>
              <div className="mt-1 text-muted">
                Total {formatNumber(activeTraceEntry.sena.strongestGPair.totalContribution, 1)}
                {activeTraceEntry.sena.strongestGPair.topContributors[0] ? `; lead contributor ${activeTraceEntry.sena.strongestGPair.topContributors[0].label}` : ""}
              </div>
            </div>
          )}
          {activeTransition && (
            <div data-testid="temporal-transition-evidence" data-visual-role="temporal-transition-evidence" className="rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase text-cyanGlow">Temporal transition evidence</div>
                  <div className="mt-1 text-sm font-black text-foreground">
                    {activeTransition.fromLabel} {"->"} {activeTransition.toLabel}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-muted">
                    Turns {activeTransition.turnSpan}; jENA {activeTransition.jenaStatus.from}{"->"}{activeTransition.jenaStatus.to}; jSNA {activeTransition.jsnaStatus.from}{"->"}{activeTransition.jsnaStatus.to}
                  </div>
                </div>
                <span className={cn(
                  "w-fit rounded-full border px-2 py-1 text-xs font-black",
                  activeTransition.direction === "increase" && "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
                  activeTransition.direction === "decrease" && "border-rose-300/35 bg-rose-300/10 text-rose-100",
                  activeTransition.direction === "stable" && "border-cardBorder/45 bg-background/35 text-muted"
                )}>
                  G {activeTransition.direction}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MetricCell label="Delta S" value={formatNumber(activeTransition.delta.S, 1)} />
                <MetricCell label="Delta W" value={formatNumber(activeTransition.delta.W, 1)} />
                <MetricCell label="Delta B" value={formatNumber(activeTransition.delta.B, 1)} />
                <MetricCell label="Delta G" value={formatNumber(activeTransition.delta.G, 1)} />
                <MetricCell label="Delta A_fusion" value={formatNumber(activeTransition.delta.fusion, 1)} />
              </div>
              <div className="mt-3 text-xs font-semibold leading-5 text-muted">
                Top G pair: {activeTransition.strongestGPair.from?.label ?? "NA"} {"->"} {activeTransition.strongestGPair.to?.label ?? "NA"}
                {activeTransition.strongestGPair.changed ? " (changed)" : " (stable)"}
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h4 className="mb-2 text-sm font-black text-foreground">Top codes</h4>
              <div className="grid gap-2">
                {activeWindow.topCodes.length > 0 ? activeWindow.topCodes.map((code) => (
                  <div key={code.id} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-bold text-foreground/86">{code.label}</span>
                    <span className="text-right font-black text-cyanGlow">{formatNumber(code.weight, 1)}</span>
                  </div>
                )) : (
                  <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No codes in this window.</div>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-black text-foreground">Evidence snippets</h4>
              <div className="grid max-h-72 gap-2 overflow-auto pr-1">
                {activeWindow.evidence.length > 0 ? activeWindow.evidence.map((snippet) => (
                  <div key={snippet.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
                      <span>{snippet.label}</span>
                      <span>{snippet.codes?.join(", ")}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground/82">{snippet.text}</p>
                  </div>
                )) : (
                  <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No evidence in this window.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">Upload utterances and coded segments to build temporal windows.</div>
      )}
    </div>
  );
}

function TemporalRuntimeTracePanel({
  trace,
  onExportJson
}: {
  trace: SenaTemporalRuntimeTrace;
  onExportJson: () => void;
}) {
  const jenaComputed = trace.windows.filter((entry) => entry.ena.status === "computed").length;
  const jsnaComputed = trace.windows.filter((entry) => entry.sna.status === "computed").length;
  const graphWindows = trace.windows.filter((entry) => entry.sna.graph);
  const averageDensity = graphWindows.reduce((total, entry) => total + (entry.sna.graph?.density ?? 0), 0) / Math.max(1, graphWindows.length);
  const activeGWindows = trace.windows.filter((entry) => entry.sena.activeGPairs > 0).length;
  const warningCount = trace.windows.reduce((total, entry) => total + entry.warnings.length, trace.warnings.length);
  const statusBadge = (status: "computed" | "skipped", tone: "violet" | "blue") => (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-black uppercase",
        status === "computed" && tone === "violet" && "border-violetGlow/45 bg-violetGlow/10 text-violetGlow",
        status === "computed" && tone === "blue" && "border-blue-400/45 bg-blue-400/10 text-blue-200",
        status === "skipped" && "border-amber-300/45 bg-amber-300/10 text-amber-100"
      )}
    >
      {status}
    </span>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-6">
          <MetricCell label="Windows" value={trace.windows.length} />
          <MetricCell label="Transitions" value={trace.transitions.length} />
          <MetricCell label="jENA computed" value={`${jenaComputed}/${trace.windows.length}`} />
          <MetricCell label="jSNA computed" value={`${jsnaComputed}/${trace.windows.length}`} />
          <MetricCell label="Avg density" value={formatNumber(averageDensity)} />
          <MetricCell label="G-active windows" value={activeGWindows} />
        </div>
        <button type="button" onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export temporal runtime
        </button>
      </div>

      {trace.transitions.length > 0 && (
        <div data-testid="temporal-transition-summary" data-visual-role="temporal-transition-summary" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-background/25 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-foreground">Temporal transition evidence</div>
              <div className="mt-1 text-xs font-semibold text-muted">Adjacent-window S/W/B/G deltas for Plan - Teach - Reflect interpretation.</div>
            </div>
            <span className="w-fit rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-xs font-black text-cyanGlow">
              {trace.transitions.length} transitions
            </span>
          </div>
          <div className="grid gap-2">
            {trace.transitions.map((transition) => (
              <div key={transition.id} data-testid="temporal-transition-summary-item" className="rounded-lg border border-cardBorder/30 bg-background/30 p-3 text-xs font-semibold leading-5 text-muted">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-black text-foreground">{transition.fromLabel} {"->"} {transition.toLabel}</div>
                    <div>Turns {transition.turnSpan}; G {transition.direction}; active G pairs {transition.delta.activeGPairs >= 0 ? "+" : ""}{transition.delta.activeGPairs}</div>
                  </div>
                  <div className="font-black text-cyanGlow">
                    Delta G {transition.delta.G >= 0 ? "+" : ""}{formatNumber(transition.delta.G, 1)}
                  </div>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-3">
                  <div>Delta S/W/B: {formatNumber(transition.delta.S, 1)} / {formatNumber(transition.delta.W, 1)} / {formatNumber(transition.delta.B, 1)}</div>
                  <div>Delta A_fusion: {formatNumber(transition.delta.fusion, 1)}</div>
                  <div>Top G pair: {transition.strongestGPair.from?.label ?? "NA"} {"->"} {transition.strongestGPair.to?.label ?? "NA"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trace.windows.length > 0 ? (
        <div className="max-h-[34rem] overflow-auto rounded-lg border border-cardBorder/35 bg-background/20">
          <table className="w-full min-w-[58rem] text-left text-xs">
            <thead className="sticky top-0 bg-background/95 text-muted">
              <tr>
                <th className="px-3 py-2 font-black">Window</th>
                <th className="px-3 py-2 font-black">Dataset</th>
                <th className="px-3 py-2 font-black">jENA</th>
                <th className="px-3 py-2 font-black">jSNA</th>
                <th className="px-3 py-2 font-black">S/W/B/G</th>
                <th className="px-3 py-2 font-black">Strongest bridge / G pair</th>
              </tr>
            </thead>
            <tbody>
              {trace.windows.map((entry) => {
                const variance = Object.entries(entry.ena.variance)
                  .slice(0, 2)
                  .map(([dimension, value]) => `${dimension} ${formatNumber(value)}`)
                  .join("; ");
                const fusionFingerprint = entry.sena.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
                return (
                  <tr key={entry.window.id} className="border-t border-cardBorder/20 align-top">
                    <td className="px-3 py-3">
                      <div className="font-black text-foreground">{entry.window.label}</div>
                      <div className="mt-1 font-semibold text-muted">Turns {entry.window.startTurn}-{entry.window.endTurn}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      <div>{entry.datasetCounts.utterances} utterances</div>
                      <div>{entry.datasetCounts.codedSegments} segments</div>
                      <div>{entry.datasetCounts.interactions} interactions</div>
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(entry.ena.status, "violet")}
                      <div className="mt-2 font-semibold text-foreground/82">
                        Rows {entry.ena.datasetCounts.rows}; dims {entry.ena.dimensions.length > 0 ? entry.ena.dimensions.join(", ") : "NA"}
                      </div>
                      <div className="mt-1 font-semibold text-muted">
                        {variance || `${entry.ena.pointCount} points; ${entry.ena.nodePositionCount} nodes`}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(entry.sna.status, "blue")}
                      <div className="mt-2 font-semibold text-foreground/82">
                        Ties {entry.sna.datasetCounts.weightedTies}; density {formatNumber(entry.sna.graph?.density ?? 0)}
                      </div>
                      <div className="mt-1 font-semibold text-muted">
                        Communities {entry.sna.datasetCounts.communities}; components {entry.sna.datasetCounts.components}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      <div>S {formatNumber(entry.sena.matrixTotals.S, 1)} / W {formatNumber(entry.sena.matrixTotals.W, 1)}</div>
                      <div>B {formatNumber(entry.sena.matrixTotals.B, 1)} / G {formatNumber(entry.sena.matrixTotals.G, 1)}</div>
                      <div className="mt-1 text-muted">active G pairs {entry.sena.activeGPairs}</div>
                      <div data-testid="temporal-window-fingerprint" data-visual-role="temporal-window-fingerprint" className="mt-2 rounded-md border border-cardBorder/25 bg-background/25 p-2">
                        <div className="text-[0.65rem] font-black uppercase text-muted">A_fusion checksum</div>
                        <div className="mt-1 font-mono text-[0.7rem] font-black text-cyanGlow">{fusionFingerprint?.checksum ?? "missing"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      {entry.sena.strongestBridgeTie ? (
                        <>
                          <div>{entry.sena.strongestBridgeTie.label}</div>
                          <div className="mt-1 text-muted">scaled {formatNumber(entry.sena.strongestBridgeTie.scaledWeight)}</div>
                        </>
                      ) : (
                        <span className="text-muted">NA</span>
                      )}
                      {entry.sena.strongestGPair && (
                        <div className="mt-3 rounded-md border border-rose-300/20 bg-rose-400/8 p-2">
                          <div className="text-[0.65rem] font-black uppercase text-rose-200">Top G pair</div>
                          <div className="mt-1 text-foreground/90">{entry.sena.strongestGPair.label}</div>
                          <div className="mt-1 text-muted">
                            total {formatNumber(entry.sena.strongestGPair.totalContribution, 1)}
                            {entry.sena.strongestGPair.topContributors[0] ? `; lead ${entry.sena.strongestGPair.topContributors[0].label}` : ""}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
          Upload utterances and coded segments to generate per-window runtime status.
        </div>
      )}

      {warningCount > 0 && (
        <div className="sena-warning-panel grid gap-2 rounded-lg p-3 text-xs font-semibold leading-5">
          {trace.warnings.slice(0, 6).map((warning, index) => (
            <div key={`${warning}-${index}`} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
          {trace.warnings.length > 6 && <div>{trace.warnings.length - 6} more runtime warnings.</div>}
        </div>
      )}
    </div>
  );
}

function ReportCompletenessAuditPanel({ audit }: { audit: SenaReportCompletenessAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Report completeness audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid max-h-72 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  {item.evidence.length > 0 && (
                    <div className="mt-1 truncate text-xs font-semibold text-foreground/72">
                      {item.evidence.slice(0, 3).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ReviewPacketAuditPanel({ audit }: { audit: SenaReviewPacketAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div data-testid="review-packet-audit" data-visual-role="review-packet-audit" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Review packet audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              data-testid={`review-packet-audit-${item.id}`}
              data-audit-id={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.actual}</div>
                  {item.evidence.length > 0 && (
                    <div className="mt-1 truncate text-xs font-semibold text-foreground/72">
                      {item.evidence.slice(0, 3).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function DemoVerificationCompatibilityAuditPanel({ audit }: { audit: SenaDemoVerificationCompatibilityAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div data-testid="demo-verification-compatibility-audit" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Demo verification compatibility audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} testId="demo-verification-compatibility-passed" />
          <MetricCell label="Review" value={audit.reviewNeeded} testId="demo-verification-compatibility-review" />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                    Expected: {item.expected}
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-foreground/72">
                    Actual: {item.actual}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ProductionPageContractPanel({ contract }: { contract: SenaProductionPageContract }) {
  const requiredTextCount = contract.sections.reduce((total, section) => total + section.requiredText.length, 0);

  return (
    <div data-testid="production-page-contract" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Production page contract</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {contract.schemaVersion}; {contract.workspaceRoute}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Text checks" value={requiredTextCount} />
          <MetricCell label="Visual checks" value={contract.visualChecks.length} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {contract.sections.map((section) => (
          <div key={section.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="text-sm font-black text-foreground">{section.label}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {section.requiredText.map((text) => (
                <span key={`${section.id}-${text}`} className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1 text-[0.68rem] font-semibold text-muted">
                  {text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        {contract.visualChecks.map((check) => (
          <div key={check.id} className="rounded-lg border border-violetGlow/35 bg-violetGlow/10 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-black text-foreground">{check.label}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.expectedOutcome}</div>
              </div>
              <code className="break-all rounded-md border border-cardBorder/35 bg-slate-950/70 px-2 py-1 text-[0.68rem] font-black text-cyanGlow">
                {check.requiredText}
              </code>
            </div>
          </div>
        ))}
      </div>

      {contract.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {contract.notes[0]}
        </div>
      )}
    </div>
  );
}

function DataContractAuditPanel({
  audit,
  onExport
}: {
  audit: SenaDataContractAudit;
  onExport: () => void;
}) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-foreground">Data contract audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <button type="button" onClick={onExport} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Download className="h-4 w-4" /> Export data audit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Passed" value={audit.passed} />
        <MetricCell label="Review" value={audit.reviewNeeded} />
      </div>

      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.actual}</div>
                  {item.status === "review" && (
                    <div className="mt-1 text-xs font-semibold leading-5 text-amber-100">
                      {item.detail.slice(0, 2).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function PilotReadinessAuditPanel({ audit }: { audit: SenaPilotReadinessAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Pilot readiness audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Ready" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = item.status === "ready" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-foreground">{item.label}</div>
                    <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.64rem] font-black uppercase text-cyanGlow">
                      {item.category}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  {item.status === "review" && (
                    <div className="mt-1 text-xs font-semibold leading-5 text-amber-100">{item.nextAction}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ClaimReadinessGatePanel({ gate }: { gate: SenaClaimReadinessGate }) {
  return (
    <div
      data-testid="claim-readiness-gate"
      data-visual-role="claim-readiness-gate"
      className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Claim readiness gate</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {gate.schemaVersion}; {gate.claimUse}
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-amber-100">
            Exploratory until coding reliability, data governance, human review, and all automated gates pass.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-80">
          <MetricCell label="Status" value={gate.status} />
          <MetricCell label="Ready" value={gate.ready} />
          <MetricCell label="Review" value={gate.reviewNeeded} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {gate.items.map((item) => {
          const Icon = item.status === "ready" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-foreground">{item.label}</div>
                    <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.64rem] font-black uppercase text-cyanGlow">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-foreground/72">{item.guardrail}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        Review blockers: {gate.blockers.length > 0 ? gate.blockers.join(", ") : "None"}.
      </div>
    </div>
  );
}

function CodingReliabilityGatePanel({ gate }: { gate: SenaCodingReliabilityGate }) {
  const Icon = gate.status === "ready" ? CheckCircle2 : AlertTriangle;

  return (
    <div
      data-testid="coding-reliability-gate"
      data-visual-role="coding-reliability-gate"
      className={cn(
        "grid gap-3 rounded-lg border p-3",
        gate.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", gate.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
          <div>
            <div className="text-sm font-black text-foreground">Coding reliability gate</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {gate.schemaVersion}; {gate.claimUse}
            </div>
            <div className="mt-2 text-xs font-semibold leading-5 text-muted">{gate.guardrail}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-80">
          <MetricCell label="Status" value={gate.status} />
          <MetricCell label="Coders" value={gate.review.coderCount} />
          <MetricCell label="Blockers" value={gate.blockers.length} />
        </div>
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Scheme</div>
          <div className="mt-1">{gate.review.codingScheme}</div>
        </div>
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Agreement</div>
          <div className="mt-1">{gate.review.agreementMetric}: {gate.review.agreementValue}</div>
        </div>
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Reviewer</div>
          <div className="mt-1">{gate.review.reviewer || "Unassigned"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        {gate.blockers.length > 0 ? `Blockers: ${gate.blockers.join(" ")}` : "Blockers: None."}
      </div>
    </div>
  );
}

function DevelopmentPlanPanel({ plan }: { plan: SenaDevelopmentPlan }) {
  const activePhase = plan.phases.find((phase) => phase.status === "active") ?? plan.phases[0];
  const productionPhase = plan.phases.find((phase) => phase.id === "production-platform");
  const deliveryCandidate = plan.deliveryCandidate;
  const nextStage = plan.nextStage;
  const phaseStyles: Record<SenaDevelopmentPlan["phases"][number]["status"], string> = {
    complete: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    active: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow",
    deferred: "border-amber-300/35 bg-amber-300/10 text-amber-100"
  };
  const nextStagePhaseStyles: Record<SenaDevelopmentPlan["nextStage"]["phases"][number]["status"], string> = {
    active: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow",
    next: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    deferred: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    gate: "border-violet-300/35 bg-violet-300/10 text-violet-100"
  };

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Development plan</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {plan.schemaVersion}; {plan.milestone}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[34rem] md:grid-cols-5">
          <MetricCell label="Gate" value={plan.currentGate.pilotReadinessStatus} />
          <MetricCell label="Checks" value={`${plan.currentGate.automatedVerification.passed}/${plan.currentGate.automatedVerification.totalChecks}`} />
          <MetricCell label="Manual pending" value={plan.currentGate.automatedVerification.manualPending} />
          <MetricCell label="Manual failed" value={plan.currentGate.automatedVerification.manualFailed} />
          <MetricCell label="Artifacts" value={plan.requiredArtifacts.length} />
        </div>
      </div>

      <div
        data-testid="delivery-candidate-plan"
        data-visual-role="local-research-pilot-delivery-candidate"
        className="grid gap-3 rounded-lg border border-cyanGlow/35 bg-cyanGlow/10 p-3"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Local research pilot delivery candidate</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {deliveryCandidate.horizon}; {deliveryCandidate.priority}; {deliveryCandidate.status}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-80">
            <MetricCell label="Weeks" value={deliveryCandidate.weeklyPlan.length} />
            <MetricCell label="Commands" value={deliveryCandidate.verificationCommands.length} />
            <MetricCell label="Handoff" value={deliveryCandidate.handoffPackage.length} />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {deliveryCandidate.weeklyPlan.map((week) => (
            <div key={week.week} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
              <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Week {week.week}</div>
              <div className="mt-1 text-sm font-black text-foreground">{week.label}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">{week.focus}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-2">
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Verification gate</div>
            {deliveryCandidate.verificationCommands.slice(0, 5).map((command) => <div key={command}>- {command}</div>)}
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Handoff package</div>
            {deliveryCandidate.handoffPackage.slice(0, 5).map((artifact) => <div key={artifact}>- {artifact}</div>)}
          </div>
        </div>
      </div>

      <div
        data-testid="next-stage-development-plan"
        data-visual-role="post-delivery-research-validation-plan"
        className="grid gap-3 rounded-lg border border-sky-300/35 bg-sky-300/10 p-3"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Next-stage development plan</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {nextStage.horizon}; {nextStage.priority}; {nextStage.status}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-80">
            <MetricCell label="Phases" value={nextStage.phases.length} />
            <MetricCell label="Release gate" value={nextStage.releaseGate.command} />
            <MetricCell label="Data cases" value={nextStage.releaseGate.dataScenarios.length} />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {nextStage.phases.map((phase) => (
            <div key={phase.id} className={cn("rounded-lg border p-3", nextStagePhaseStyles[phase.status])}>
              <div className="text-[0.64rem] font-black uppercase">{phase.status}</div>
              <div className="mt-1 text-sm font-black text-foreground">{phase.label}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">{phase.goal}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Release gate</div>
            <div>{nextStage.baseline.command}</div>
            <div className="mt-1">{nextStage.baseline.expectedResult}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Claim gate</div>
            <div>{nextStage.assumptions.find((assumption) => assumption.includes("exploratory-only")) ?? "Reports remain exploratory-only until review gates pass."}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Public interfaces</div>
            {nextStage.publicInterfacePolicy.slice(0, 2).map((policy) => <div key={policy}>- {policy}</div>)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-cyanGlow">Current focus</div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm leading-6">
            <div className="font-black text-foreground">{activePhase?.label ?? "Local research pilot"}</div>
            <div className="mt-1 text-muted">{activePhase?.scope ?? "Local pilot scope is being prepared for research walkthroughs."}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm leading-6">
            <div className="font-black text-foreground">{productionPhase?.label ?? "Production platform"}</div>
            <div className="mt-1 text-muted">{productionPhase?.scope ?? "Production platform work remains deferred."}</div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-cyanGlow">Scope boundary</div>
          <div className="grid gap-2 text-xs font-semibold leading-5 text-muted sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
              <div className="mb-1 font-black text-emerald-100">In scope</div>
              {plan.scope.inScope.slice(0, 3).map((item) => <div key={item}>- {item}</div>)}
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
              <div className="mb-1 font-black text-amber-100">Deferred</div>
              {plan.scope.outOfScope.slice(0, 3).map((item) => <div key={item}>- {item}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {plan.phases.map((phase) => (
          <div key={phase.id} className={cn("rounded-lg border px-3 py-2", phaseStyles[phase.status])}>
            <div className="text-sm font-black text-foreground">{phase.label}</div>
            <div className="mt-1 text-[0.64rem] font-black uppercase">{phase.status}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
        {plan.nextDecisions.slice(0, 3).map((decision) => (
          <div key={decision} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            {decision}
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoVerificationPanel({
  verification,
  defaultReviewer,
  onManualReviewChange
}: {
  verification: SenaDemoVerification;
  defaultReviewer: string;
  onManualReviewChange: (checkId: string, patch: Partial<SenaDemoVerificationCheck["manualReview"]>) => void;
}) {
  const reviewChecks = verification.checks.filter((check) => check.status === "review");
  const visibleChecks = reviewChecks.length > 0
    ? [...reviewChecks, ...verification.checks.filter((check) => check.status !== "review")]
    : verification.checks;

  return (
    <div className="rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Demo verification checklist</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {verification.schemaVersion}; {verification.summary.pilotReadinessStatus}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[34rem] sm:grid-cols-5">
          <MetricCell label="Auto pass" value={verification.summary.automatedPass} testId="demo-verification-summary-pass" />
          <MetricCell label="Auto review" value={verification.summary.automatedReview} testId="demo-verification-summary-review" />
          <MetricCell label="Pending" value={verification.summary.manualPending} testId="demo-verification-summary-manual-pending" />
          <MetricCell label="Passed" value={verification.summary.manualPassed} testId="demo-verification-summary-manual-passed" />
          <MetricCell label="Failed" value={verification.summary.manualFailed} testId="demo-verification-summary-manual-failed" />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        Required artifacts: {verification.summary.requiredArtifacts.join(", ")}
      </div>

      <div className="mt-3 grid gap-2">
        {visibleChecks.map((check) => {
          const Icon = check.status === "pass" ? CheckCircle2 : AlertTriangle;
          const evidence = check.observedEvidence.slice(0, 4);
          const setManualStatus = (status: SenaDemoVerificationCheck["manualReview"]["status"]) => {
            onManualReviewChange(check.id, {
              status,
              reviewer: check.manualReview.reviewer || defaultReviewer,
              verifiedAt: status === "pending" ? "" : new Date().toISOString()
            });
          };
          return (
            <div
              key={check.id}
              data-testid={`demo-verification-check-${check.id}`}
              className={cn(
                "rounded-lg border px-3 py-2",
                check.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", check.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black text-foreground">{check.label}</div>
                    <a href={check.anchor} className="text-xs font-black text-cyanGlow hover:text-foreground">{check.anchor}</a>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.manualAction}</div>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <div className="rounded-lg border border-cardBorder/25 bg-background/25 p-2">
                      <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Expected</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.expectedOutcome}</div>
                    </div>
                    <div className="rounded-lg border border-cardBorder/25 bg-background/25 p-2">
                      <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Observed evidence</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                        {evidence.join("; ")}
                        {check.observedEvidence.length > evidence.length ? `; +${check.observedEvidence.length - evidence.length} more` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-semibold leading-5 text-muted">
                    Artifacts: {check.requiredArtifacts.join(", ")}
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-cardBorder/25 bg-background/25 p-2 lg:grid-cols-[9rem_1fr_1.2fr]">
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Manual status
                      <select
                        data-testid={`demo-verification-status-${check.id}`}
                        value={check.manualReview.status}
                        onChange={(event) => setManualStatus(event.currentTarget.value as SenaDemoVerificationCheck["manualReview"]["status"])}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        <option value="pending">Pending</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Reviewer
                      <input
                        data-testid={`demo-verification-reviewer-${check.id}`}
                        value={check.manualReview.reviewer}
                        onChange={(event) => onManualReviewChange(check.id, { reviewer: event.currentTarget.value })}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Notes
                      <input
                        data-testid={`demo-verification-notes-${check.id}`}
                        value={check.manualReview.notes}
                        onChange={(event) => onManualReviewChange(check.id, { notes: event.currentTarget.value })}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                    </label>
                    {check.manualReview.verifiedAt && (
                      <div className="text-xs font-semibold leading-5 text-muted lg:col-span-3">
                        Verified at: {check.manualReview.verifiedAt}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportGenerator({
  model,
  completenessAudit,
  reviewPacketAudit,
  pilotReadinessAudit,
  claimReadinessGate,
  codingReliabilityGate,
  developmentPlan,
  demoVerification,
  demoVerificationCompatibilityAudit,
  productionPageContract,
  onDemoManualReviewChange,
  reportTitle,
  onReportTitleChange,
  reviewStatus,
  onReviewStatusChange,
  reviewer,
  onReviewerChange,
  interpretation,
  onInterpretationChange,
  limitations,
  onLimitationsChange,
  nextActions,
  onNextActionsChange,
  dataGovernanceIrbApprovalId,
  onDataGovernanceIrbApprovalIdChange,
  dataGovernanceConsentScope,
  onDataGovernanceConsentScopeChange,
  dataGovernanceRetentionPolicy,
  onDataGovernanceRetentionPolicyChange,
  dataGovernanceUsageConstraints,
  onDataGovernanceUsageConstraintsChange,
  dataGovernanceDataSteward,
  onDataGovernanceDataStewardChange,
  codingReliabilityStatus,
  onCodingReliabilityStatusChange,
  codingReliabilityReviewer,
  onCodingReliabilityReviewerChange,
  codingScheme,
  onCodingSchemeChange,
  unitOfCoding,
  onUnitOfCodingChange,
  coderCount,
  onCoderCountChange,
  agreementMetric,
  onAgreementMetricChange,
  agreementValue,
  onAgreementValueChange,
  adjudicationNotes,
  onAdjudicationNotesChange,
  reliabilityLimitations,
  onReliabilityLimitationsChange,
  onExportWalkthroughJson,
  onExportVerificationJson,
  onExportVerificationCompatibilityJson,
  onExportProductionPageContractJson,
  onExportProjectSnapshot,
  onExportDevelopmentPlanJson,
  onExportEnaReport,
  onExportRuntimeBundleJson,
  onExportRuntimeConsistencyAuditJson,
  onExportReadinessJson,
  onExportCodingReliabilityJson,
  onExportReliabilityDashboardJson,
  onExportClaimReadinessJson,
  onExportReviewPacket,
  onExportJson,
  onExportMarkdown,
  onReliabilityUpload,
  hasReliabilityDashboard,
  onExportPublication
}: {
  model: SenaModel;
  completenessAudit: SenaReportCompletenessAudit;
  reviewPacketAudit: SenaReviewPacketAudit;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  claimReadinessGate: SenaClaimReadinessGate;
  codingReliabilityGate: SenaCodingReliabilityGate;
  developmentPlan: SenaDevelopmentPlan;
  demoVerification: SenaDemoVerification;
  demoVerificationCompatibilityAudit: SenaDemoVerificationCompatibilityAudit;
  productionPageContract: SenaProductionPageContract;
  onDemoManualReviewChange: (checkId: string, patch: Partial<SenaDemoVerificationCheck["manualReview"]>) => void;
  reportTitle: string;
  onReportTitleChange: (value: string) => void;
  reviewStatus: SenaReportHumanReview["status"];
  onReviewStatusChange: (value: SenaReportHumanReview["status"]) => void;
  reviewer: string;
  onReviewerChange: (value: string) => void;
  interpretation: string;
  onInterpretationChange: (value: string) => void;
  limitations: string;
  onLimitationsChange: (value: string) => void;
  nextActions: string;
  onNextActionsChange: (value: string) => void;
  dataGovernanceIrbApprovalId: string;
  onDataGovernanceIrbApprovalIdChange: (value: string) => void;
  dataGovernanceConsentScope: string;
  onDataGovernanceConsentScopeChange: (value: string) => void;
  dataGovernanceRetentionPolicy: string;
  onDataGovernanceRetentionPolicyChange: (value: string) => void;
  dataGovernanceUsageConstraints: string;
  onDataGovernanceUsageConstraintsChange: (value: string) => void;
  dataGovernanceDataSteward: string;
  onDataGovernanceDataStewardChange: (value: string) => void;
  codingReliabilityStatus: SenaCodingReliabilityReview["status"];
  onCodingReliabilityStatusChange: (value: SenaCodingReliabilityReview["status"]) => void;
  codingReliabilityReviewer: string;
  onCodingReliabilityReviewerChange: (value: string) => void;
  codingScheme: string;
  onCodingSchemeChange: (value: string) => void;
  unitOfCoding: string;
  onUnitOfCodingChange: (value: string) => void;
  coderCount: number;
  onCoderCountChange: (value: number) => void;
  agreementMetric: string;
  onAgreementMetricChange: (value: string) => void;
  agreementValue: string;
  onAgreementValueChange: (value: string) => void;
  adjudicationNotes: string;
  onAdjudicationNotesChange: (value: string) => void;
  reliabilityLimitations: string;
  onReliabilityLimitationsChange: (value: string) => void;
  onExportWalkthroughJson: () => void;
  onExportVerificationJson: () => void;
  onExportVerificationCompatibilityJson: () => void;
  onExportProductionPageContractJson: () => void;
  onExportProjectSnapshot: () => void;
  onExportDevelopmentPlanJson: () => void;
  onExportEnaReport: () => void;
  onExportRuntimeBundleJson: () => void;
  onExportRuntimeConsistencyAuditJson: () => void;
  onExportReadinessJson: () => void;
  onExportCodingReliabilityJson: () => void;
  onExportReliabilityDashboardJson: () => void;
  onExportClaimReadinessJson: () => void;
  onExportReviewPacket: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onReliabilityUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  hasReliabilityDashboard: boolean;
  onExportPublication: (format: PublicationFormat) => void;
}) {
  const edgeEvidenceCount = model.edges.reduce((total, edge) => total + edge.evidence.length, 0);
  const pairEvidenceCount = model.pairReport.reduce((total, pair) => total + pair.evidence.length, 0);
  const temporalEvidenceCount = model.temporal.windows.reduce((total, window) => total + window.evidence.length, 0);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCell label="Matrices" value={5} />
        <MetricCell label="Figures" value={3} />
        <MetricCell label="Evidence refs" value={edgeEvidenceCount + pairEvidenceCount + temporalEvidenceCount} />
        <MetricCell label="Review" value={reviewStatus === "human-reviewed" ? "Reviewed" : "Draft"} />
      </div>

      <PilotReadinessAuditPanel audit={pilotReadinessAudit} />

      <ClaimReadinessGatePanel gate={claimReadinessGate} />

      <CodingReliabilityGatePanel gate={codingReliabilityGate} />

      <DevelopmentPlanPanel plan={developmentPlan} />

      <DemoVerificationPanel verification={demoVerification} defaultReviewer={reviewer} onManualReviewChange={onDemoManualReviewChange} />

      <DemoVerificationCompatibilityAuditPanel audit={demoVerificationCompatibilityAudit} />

      <ProductionPageContractPanel contract={productionPageContract} />

      <ReportCompletenessAuditPanel audit={completenessAudit} />

      <ReviewPacketAuditPanel audit={reviewPacketAudit} />

      <div className="grid gap-3 lg:grid-cols-[1fr_12rem_14rem]">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Report title
          <input
            value={reportTitle}
            onChange={(event) => onReportTitleChange(event.currentTarget.value)}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Status
          <select
            value={reviewStatus}
            onChange={(event) => onReviewStatusChange(event.currentTarget.value as SenaReportHumanReview["status"])}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          >
            <option value="draft">Draft</option>
            <option value="human-reviewed">Human-reviewed</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Reviewer
          <input
            value={reviewer}
            onChange={(event) => onReviewerChange(event.currentTarget.value)}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Interpretation
          <textarea
            value={interpretation}
            onChange={(event) => onInterpretationChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Limitations
          <textarea
            value={limitations}
            onChange={(event) => onLimitationsChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Next actions
          <textarea
            value={nextActions}
            onChange={(event) => onNextActionsChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
      </div>

      <div data-testid="data-governance-metadata" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Data governance metadata</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              Captured in report, snapshot, review packet, runtime bundle, and publication package exports.
            </div>
          </div>
          <div className="text-xs font-black text-muted">sena-data-governance-metadata/v1</div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            IRB / ethics approval ID
            <input
              data-testid="data-governance-irb-approval"
              value={dataGovernanceIrbApprovalId}
              onChange={(event) => onDataGovernanceIrbApprovalIdChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Data steward
            <input
              data-testid="data-governance-data-steward"
              value={dataGovernanceDataSteward}
              onChange={(event) => onDataGovernanceDataStewardChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Consent scope
            <textarea
              data-testid="data-governance-consent-scope"
              value={dataGovernanceConsentScope}
              onChange={(event) => onDataGovernanceConsentScopeChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Retention policy
            <textarea
              data-testid="data-governance-retention-policy"
              value={dataGovernanceRetentionPolicy}
              onChange={(event) => onDataGovernanceRetentionPolicyChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Usage constraints
            <textarea
              data-testid="data-governance-usage-constraints"
              value={dataGovernanceUsageConstraints}
              onChange={(event) => onDataGovernanceUsageConstraintsChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
        <div>
          <div className="text-sm font-black text-foreground">Coding reliability evidence</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            Used by the coding reliability gate before any research-claim-ready export.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Upload className="h-4 w-4" /> Upload coder annotations
            <input type="file" accept=".csv,.json,.xlsx,.xls,text/csv,application/json" multiple className="sr-only" onChange={onReliabilityUpload} />
          </label>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
            Columns: coder_id, item_id or segment_id, code_id or codes, optional value.
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[12rem_1fr_1fr_8rem]">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Status
            <select
              data-testid="coding-reliability-status"
              value={codingReliabilityStatus}
              onChange={(event) => onCodingReliabilityStatusChange(event.currentTarget.value as SenaCodingReliabilityReview["status"])}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            >
              <option value="not-documented">Not documented</option>
              <option value="documented">Documented</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Reliability reviewer
            <input
              data-testid="coding-reliability-reviewer"
              value={codingReliabilityReviewer}
              onChange={(event) => onCodingReliabilityReviewerChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Coding scheme
            <input
              data-testid="coding-scheme"
              value={codingScheme}
              onChange={(event) => onCodingSchemeChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Coders
            <input
              data-testid="coder-count"
              type="number"
              min={0}
              value={coderCount}
              onChange={(event) => onCoderCountChange(Number(event.currentTarget.value))}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Unit of coding
            <input
              data-testid="unit-of-coding"
              value={unitOfCoding}
              onChange={(event) => onUnitOfCodingChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Agreement metric
            <input
              data-testid="agreement-metric"
              value={agreementMetric}
              onChange={(event) => onAgreementMetricChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Agreement value
            <input
              data-testid="agreement-value"
              value={agreementValue}
              onChange={(event) => onAgreementValueChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Adjudication notes
            <textarea
              data-testid="adjudication-notes"
              value={adjudicationNotes}
              onChange={(event) => onAdjudicationNotesChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Reliability limitations
            <textarea
              data-testid="reliability-limitations"
              value={reliabilityLimitations}
              onChange={(event) => onReliabilityLimitationsChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={onExportWalkthroughJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export walkthrough JSON
        </button>
        <button onClick={onExportVerificationJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export verification JSON
        </button>
        <button data-testid="export-demo-verification-compatibility" onClick={onExportVerificationCompatibilityJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export compatibility audit
        </button>
        <button onClick={onExportProductionPageContractJson} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export page contract
        </button>
        <button data-testid="export-project-snapshot" onClick={onExportProjectSnapshot} className={buttonStyles({ variant: "secondary" })}>
          <Database className="h-4 w-4" /> Export project snapshot
        </button>
        <button onClick={onExportDevelopmentPlanJson} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export development plan
        </button>
        <button onClick={onExportEnaReport} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export ENA report
        </button>
        <button onClick={onExportRuntimeBundleJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export runtime bundle
        </button>
        <button onClick={onExportRuntimeConsistencyAuditJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export runtime audit
        </button>
        <button onClick={onExportReadinessJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export readiness JSON
        </button>
        <button onClick={onExportCodingReliabilityJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export reliability gate
        </button>
        <button data-testid="export-reliability-dashboard" onClick={onExportReliabilityDashboardJson} disabled={!hasReliabilityDashboard} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export reliability dashboard
        </button>
        <button onClick={onExportClaimReadinessJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export claim gate JSON
        </button>
        <button onClick={onExportReviewPacket} className={buttonStyles()}>
          <Download className="h-4 w-4" /> Export review packet
        </button>
        <button onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export report JSON
        </button>
        <button onClick={onExportMarkdown} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export report MD
        </button>
        <button data-testid="export-publication-html" onClick={() => onExportPublication("html")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export HTML
        </button>
        <button data-testid="export-publication-svg" onClick={() => onExportPublication("svg")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export figure SVG
        </button>
        <button data-testid="export-publication-png" onClick={() => onExportPublication("png")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export figure PNG
        </button>
        <button data-testid="export-publication-xlsx" onClick={() => onExportPublication("xlsx")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export Excel
        </button>
        <button data-testid="export-publication-docx" onClick={() => onExportPublication("docx")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export DOCX
        </button>
        <button data-testid="export-publication-pdf" onClick={() => onExportPublication("pdf")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export PDF
        </button>
        <button data-testid="export-publication-package" onClick={() => onExportPublication("package")} className={buttonStyles()}>
          <Download className="h-4 w-4" /> Export publication package
        </button>
      </div>
    </div>
  );
}

function SocialMetricsTable({ actors }: { actors: SenaModel["socialReport"]["actors"] }) {
  const sortedActors = [...actors].sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label));

  if (sortedActors.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">Upload interactions to calculate actor-level SNA metrics.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cardBorder/45 bg-background/25">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-cardBorder/35 text-muted">
            <th className="px-3 py-2 font-black">Actor</th>
            <th className="px-3 py-2 font-black">Strength</th>
            <th className="px-3 py-2 font-black">Degree</th>
            <th className="px-3 py-2 font-black">Betweenness</th>
            <th className="px-3 py-2 font-black">Closeness</th>
            <th className="px-3 py-2 font-black">Reach</th>
            <th className="px-3 py-2 font-black">Community</th>
            <th className="px-3 py-2 font-black">Component</th>
          </tr>
        </thead>
        <tbody>
          {sortedActors.map((actor) => (
            <tr key={actor.id} className="border-t border-cardBorder/20">
              <td className="whitespace-nowrap px-3 py-2">
                <div className="font-black text-foreground">{actor.label}</div>
                <div className="text-[0.68rem] font-semibold text-muted">{actor.role} - {actor.group}</div>
              </td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(actor.strength, 1)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(actor.degree, 1)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(actor.betweenness)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(actor.closeness)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(actor.reachable, 0)}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{actor.community >= 0 ? actor.community + 1 : "NA"}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{actor.component >= 0 ? actor.component + 1 : "NA"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommunityList({ communities }: { communities: SenaModel["socialReport"]["communities"] }) {
  if (communities.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No communities detected yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {communities.map((community) => (
        <div key={community.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-black text-foreground">{community.label}</div>
            <div className="text-xs font-black text-cyanGlow">{community.size} actor{community.size === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-2 text-sm font-semibold leading-6 text-muted">{community.members.join(", ")}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricCell label="Internal weight" value={formatNumber(community.internalWeight, 1)} />
            <MetricCell label="External weight" value={formatNumber(community.externalWeight, 1)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PairContributionTable({ pairs }: { pairs: SenaModel["pairReport"] }) {
  const activePairs = pairs
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));

  if (activePairs.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">Upload coded segments to calculate person-code-pair contributions.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cardBorder/45 bg-background/25">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-cardBorder/35 text-muted">
            <th className="px-3 py-2 font-black">Code-pair</th>
            <th className="px-3 py-2 font-black">Total G</th>
            <th className="px-3 py-2 font-black">Top contributors</th>
            <th className="px-3 py-2 font-black">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {activePairs.map((pair) => (
            <tr key={pair.id} className="border-t border-cardBorder/20">
              <td className="whitespace-nowrap px-3 py-2 font-black text-foreground">{pair.label}</td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{formatNumber(pair.totalContribution, 1)}</td>
              <td className="min-w-56 px-3 py-2 font-semibold text-foreground/82">
                {pair.topContributors.map((contributor) => (
                  `${contributor.label} ${formatNumber(contributor.weight, 1)} (D ${formatNumber(contributor.directWeight, 1)} / S ${formatNumber(contributor.supportingWeight, 1)})`
                )).join(", ")}
              </td>
              <td className="px-3 py-2 font-semibold text-foreground/82">{pair.evidence.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FusionMathAuditPanel({ audit }: { audit: SenaFusionMathAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Fusion math audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Pass" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 grid gap-1 text-xs font-semibold leading-5 text-muted">
                    <div>Expected: {item.expected}</div>
                    <div>Actual: {item.actual}</div>
                    {typeof item.maxDelta === "number" && (
                      <div>Max delta: {formatNumber(item.maxDelta)} within tolerance {formatNumber(item.tolerance ?? 0)}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {audit.notes.length > 0 && (
        <div className="mt-3 text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function MethodFormulaPanel({
  model,
  fusionMathAudit,
  onExportMathAudit,
  onExportMethodProtocol,
  onExportVisualGrammar
}: {
  model: SenaModel;
  fusionMathAudit: SenaFusionMathAudit;
  onExportMathAudit: () => void;
  onExportMethodProtocol: () => void;
  onExportVisualGrammar: () => void;
}) {
  const options = model.options;
  const peopleCount = model.people.length;
  const codeCount = model.codes.length;
  const pairCount = model.matrices.G.pairs.length;
  const socialNormalized = upperTriangleTotal(model.matrices.S.normalized);
  const conceptNormalized = upperTriangleTotal(model.matrices.W.normalized);
  const bridgeNormalized = matrixTotal(model.matrices.B.normalized);
  const matrixFingerprints = fusionMathAudit.matrixFingerprints;
  const formatOptionalNumber = (value?: number) => (typeof value === "number" ? formatNumber(value) : "NA");
  const ledgerRows = [
    {
      id: "S",
      source: "jSNA / sna.js",
      dimensions: `${peopleCount}x${peopleCount}`,
      rawTotal: formatNumber(upperTriangleTotal(model.matrices.S.raw)),
      normalizedTotal: formatNumber(socialNormalized),
      activeTotal: formatNumber(socialNormalized * options.alpha),
      note: "social block"
    },
    {
      id: "W",
      source: "jENA aligned",
      dimensions: `${codeCount}x${codeCount}`,
      rawTotal: formatNumber(upperTriangleTotal(model.matrices.W.raw)),
      normalizedTotal: formatNumber(conceptNormalized),
      activeTotal: formatNumber(conceptNormalized * options.beta),
      note: "concept block"
    },
    {
      id: "B",
      source: "SENA bridge",
      dimensions: `${peopleCount}x${codeCount}`,
      rawTotal: formatNumber(matrixTotal(model.matrices.B.raw)),
      normalizedTotal: formatNumber(bridgeNormalized),
      activeTotal: formatNumber(bridgeNormalized * options.gamma),
      note: "off-diagonal block"
    },
    {
      id: "G",
      source: "G pair layer",
      dimensions: `${peopleCount}x${pairCount}`,
      rawTotal: formatNumber(matrixTotal(model.matrices.G.raw)),
      normalizedTotal: formatNumber(matrixTotal(model.matrices.G.normalized)),
      activeTotal: `${model.pairReport.filter((pair) => pair.totalContribution > 0).length} pairs`,
      note: "explanatory layer"
    },
    {
      id: "A_fusion",
      source: "A_fusion block matrix",
      dimensions: `${peopleCount + codeCount}x${peopleCount + codeCount}`,
      rawTotal: "S/W/B",
      normalizedTotal: "weighted",
      activeTotal: formatNumber((socialNormalized * options.alpha) + (conceptNormalized * options.beta) + (bridgeNormalized * options.gamma)),
      note: "fusion total"
    }
  ];

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-cyanGlow">Fusion matrix</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onExportMethodProtocol} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <FileText className="h-4 w-4" /> Export method protocol
            </button>
            <button type="button" onClick={onExportVisualGrammar} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <Eye className="h-4 w-4" /> Export visual grammar
            </button>
            <button type="button" onClick={onExportMathAudit} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <Download className="h-4 w-4" /> Export math audit
            </button>
          </div>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-cardBorder/35 bg-slate-950/80 p-3 text-xs font-black leading-6 text-cyanGlow">
{`A_fusion = [ alpha*S   gamma*B  ]
           [ gamma*B'  beta*W   ]`}
        </pre>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricCell label="alpha SNA" value={formatNumber(options.alpha)} />
          <MetricCell label="beta ENA" value={formatNumber(options.beta)} />
          <MetricCell label="gamma bridge" value={formatNumber(options.gamma)} />
        </div>
      </div>

      <div data-testid="live-matrix-ledger" data-visual-role="sena-live-matrix-ledger" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Live matrix ledger</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              Current block dimensions and totals derived from the active SENA model.
            </div>
          </div>
          <div data-testid="live-matrix-ledger-normalization" className="inline-flex w-fit rounded-full border border-cardBorder/45 bg-background/45 px-3 py-1 text-xs font-black text-foreground">
            Normalization {options.normalization}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-cardBorder/35">
                <th className="px-2 py-2 font-black">Block</th>
                <th className="px-2 py-2 font-black">Runtime/source</th>
                <th className="px-2 py-2 font-black">Size</th>
                <th className="px-2 py-2 text-right font-black">Raw</th>
                <th className="px-2 py-2 text-right font-black">Normalized</th>
                <th className="px-2 py-2 text-right font-black">Active</th>
                <th className="px-2 py-2 font-black">Role</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.id} data-testid={`live-matrix-ledger-${row.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border-b border-cardBorder/20 last:border-0">
                  <td className="px-2 py-2 font-black text-foreground">{row.id}</td>
                  <td className="px-2 py-2 font-semibold text-foreground/82">{row.source}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{row.dimensions}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">{row.rawTotal}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">{row.normalizedTotal}</td>
                  <td className="px-2 py-2 text-right font-black text-cyanGlow">{row.activeTotal}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div data-testid="matrix-fingerprint-ledger" data-visual-role="sena-matrix-fingerprint-ledger" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Matrix fingerprints</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              S/W/B/G/A_fusion fingerprints use sena-stable-fnv1a32/v1 so report, runtime bundle, and review packet handoffs can be checked against the same matrix results.
            </div>
          </div>
          <div className="inline-flex w-fit rounded-full border border-cardBorder/45 bg-background/45 px-3 py-1 text-xs font-black text-foreground">
            {matrixFingerprints.length} checksums
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-cardBorder/35">
                <th className="px-2 py-2 font-black">Matrix</th>
                <th className="px-2 py-2 font-black">Shape</th>
                <th className="px-2 py-2 font-black">Checksum</th>
                <th className="px-2 py-2 text-right font-black">Non-zero</th>
                <th className="px-2 py-2 text-right font-black">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixFingerprints.map((fingerprint) => (
                <tr key={fingerprint.id} data-testid={`matrix-fingerprint-${fingerprint.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border-b border-cardBorder/20 last:border-0">
                  <td className="px-2 py-2 font-black text-foreground">{fingerprint.id}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{fingerprint.shape}</td>
                  <td className="px-2 py-2 font-mono text-[0.7rem] font-black text-cyanGlow">{fingerprint.checksum}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">
                    {fingerprint.nonZero.values ?? fingerprint.nonZero.normalized ?? fingerprint.nonZero.raw ?? "NA"}
                  </td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">
                    {formatOptionalNumber(fingerprint.totals.values ?? fingerprint.totals.normalized ?? fingerprint.totals.raw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 text-sm leading-6 text-muted">
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">S:</span> person-person social ties from interactions, analyzed with local sna.js metrics.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">W:</span> code-code epistemic co-occurrence from stanza/window coded segments, aligned with jENA manifest output.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">B:</span> person-code contribution bridge linking actors to epistemic moves.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">G:</span> person-code-pair contribution for explaining who supports ENA-style links such as Evidence-Explanation.
        </div>
      </div>

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        The fusion matrix is a typed heterogeneous adjacency model. It supports exploratory graph analysis and reporting, but it is not a causal model or an inferential test without additional study design and validation.
      </div>

      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-xs font-semibold leading-5 text-muted">
        Method protocol and visual grammar exports record the S/W/B/G layer definitions, `A_fusion` block equation, selected weights, Temporal Fusion Arc story view, A1 Inner Solid Mesh canvas grammar, local jENA/jSNA runtime provenance, the metric provenance companion artifact, and interpretation guardrails.
      </div>

      <FusionMathAuditPanel audit={fusionMathAudit} />
    </div>
  );
}

function MethodValidationPanel({ validation }: { validation: SenaValidation }) {
  const layerVariants = validation.sensitivity.layerWeights.variants;
  const normalizationVariants = validation.sensitivity.normalization.variants;
  const community = validation.stability.community;
  const temporal = validation.stability.temporal;
  const nullModels = validation.nullModels;
  const metricSources = Array.from(new Set(validation.metricProvenance.map((metric) => metric.source)));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCell label="Metric sources" value={validation.metricProvenance.length} />
        <MetricCell label="Weight variants" value={layerVariants.length} />
        <MetricCell label="Normalization variants" value={normalizationVariants.length} />
        <MetricCell label="Null iterations" value={nullModels.permutation.iterations} />
      </div>

      <div
        data-testid="metric-provenance-panel"
        data-visual-role="sena-metric-provenance"
        className="rounded-lg border border-cardBorder/40 bg-background/25 p-3"
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Metric provenance</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              sena-metric-provenance/v1; {metricSources.join(", ")}; parity and interpretation limits are carried into report exports.
            </div>
          </div>
          <Info className="h-4 w-4 shrink-0 text-cyanGlow" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-cardBorder/35 text-muted">
                <th className="px-2 py-2 font-black">Metric</th>
                <th className="px-2 py-2 font-black">Scope</th>
                <th className="px-2 py-2 font-black">Source</th>
                <th className="px-2 py-2 font-black">Parity</th>
                <th className="px-2 py-2 font-black">Limit</th>
              </tr>
            </thead>
            <tbody>
              {validation.metricProvenance.map((metric) => (
                <tr key={metric.id} data-metric-id={metric.id} className="border-t border-cardBorder/20">
                  <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{metric.label}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-foreground/82">{metric.scope}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-cyanGlow">{metric.source}</td>
                  <td className="min-w-56 px-2 py-2 font-semibold text-foreground/82">{metric.parityStatus}</td>
                  <td className="min-w-64 px-2 py-2 font-semibold text-muted">{metric.interpretationLimit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">{validation.sensitivity.layerWeights.label}</div>
              <div className="mt-1 text-xs font-semibold text-muted">Fusion totals under alpha, beta, and gamma changes.</div>
            </div>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cardBorder/35 text-muted">
                  <th className="px-2 py-2 font-black">Variant</th>
                  <th className="px-2 py-2 font-black">S</th>
                  <th className="px-2 py-2 font-black">W</th>
                  <th className="px-2 py-2 font-black">B</th>
                  <th className="px-2 py-2 font-black">Delta</th>
                  <th className="px-2 py-2 font-black">Strongest</th>
                </tr>
              </thead>
              <tbody>
                {layerVariants.map((variant) => (
                  <tr key={variant.id} className="border-t border-cardBorder/20">
                    <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{variant.label}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.fusionLayerTotals.social)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.fusionLayerTotals.concept)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.fusionLayerTotals.bridge)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.fusionTotalDelta)}</td>
                    <td className="min-w-40 px-2 py-2 font-semibold text-muted">{variant.strongestScaledEdge?.label ?? "NA"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-foreground">{validation.sensitivity.normalization.label}</div>
                <div className="mt-1 text-xs font-semibold text-muted">Compare max, log-max, and raw-weight scaling.</div>
              </div>
              <Binary className="h-4 w-4 shrink-0 text-cyanGlow" />
            </div>
            <div className="grid gap-2">
              {normalizationVariants.map((variant) => (
                <div key={variant.id} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{variant.label}</span>
                  <span className="text-right font-semibold text-muted">Total {formatNumber(variant.fusionLayerTotals.total)}</span>
                  <span className="text-right font-semibold text-muted">Delta {formatNumber(variant.fusionTotalDelta)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-foreground">Community Stability</div>
                <div className="mt-1 text-xs font-semibold text-muted">{community.method}</div>
              </div>
              <UsersRound className="h-4 w-4 shrink-0 text-blue-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Repeat agreement" value={formatNumber(community.deterministicRepeatAgreement)} />
              <MetricCell label="Stable norm." value={community.stableAcrossNormalizations ? "Yes" : "Review"} />
            </div>
            <div className="mt-3 grid gap-2">
              {community.normalizationAgreement.map((entry) => (
                <div key={entry.normalization} className="flex items-center justify-between gap-3 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs font-semibold text-muted">
                  <span>{entry.normalization}</span>
                  <span>agreement {formatNumber(entry.agreement)}; communities {entry.communityCount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">Temporal Stability</div>
              <div className="mt-1 text-xs font-semibold text-muted">Coverage and peak signal under stage, moving, and turn windows.</div>
            </div>
            <Activity className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cardBorder/35 text-muted">
                  <th className="px-2 py-2 font-black">Mode</th>
                  <th className="px-2 py-2 font-black">Windows</th>
                  <th className="px-2 py-2 font-black">Segments</th>
                  <th className="px-2 py-2 font-black">Interactions</th>
                  <th className="px-2 py-2 font-black">Peak B</th>
                </tr>
              </thead>
              <tbody>
                {temporal.variants.map((variant) => (
                  <tr key={variant.mode} className="border-t border-cardBorder/20">
                    <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{variant.mode}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{variant.windowCount}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.segmentCoverage)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.interactionCoverage)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatNumber(variant.maxBridgeIntegration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">Permutation and Bootstrap Null Models</div>
              <div className="mt-1 text-xs font-semibold text-muted">Target: {nullModels.targetConceptPair.label}</div>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MetricCell label="Observed W" value={formatNumber(nullModels.targetConceptPair.observedWeight)} />
            <MetricCell label="p >= obs" value={formatNumber(nullModels.permutation.pValueGreaterOrEqual)} />
            <MetricCell label="Boot lower" value={formatNumber(nullModels.bootstrap.lower)} />
            <MetricCell label="Boot upper" value={formatNumber(nullModels.bootstrap.upper)} />
          </div>
          <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-muted">
            {nullModels.notes.map((note) => (
              <div key={note} className="rounded-lg border border-cardBorder/30 bg-background/25 p-2">{note}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        Validation diagnostics are report gates for local pilots. They document sensitivity, stability, and lightweight null checks, but publication claims still require study design, coding reliability, and human review.
      </div>
    </div>
  );
}

function EvidenceLedgerPanel({
  ledger,
  sourceFilter,
  onSourceFilterChange,
  onExportJson
}: {
  ledger: SenaEvidenceLedger;
  sourceFilter: EvidenceSourceFilter;
  onSourceFilterChange: (source: EvidenceSourceFilter) => void;
  onExportJson: () => void;
}) {
  const snippets = sourceFilter === "all"
    ? ledger.snippets
    : ledger.snippets.filter((snippet) => snippet.source === sourceFilter);

  const lineageCount = ledger.snippets.filter((snippet) => snippet.lineage).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          <MetricCell label="Evidence refs" value={ledger.snippets.length} />
          <MetricCell label="SNA refs" value={ledger.sourceCounts["social-edge"]} />
          <MetricCell label="ENA refs" value={ledger.sourceCounts["concept-edge"]} />
          <MetricCell label="Bridge refs" value={ledger.sourceCounts["bridge-edge"]} />
          <MetricCell label="G refs" value={ledger.sourceCounts["pair-contribution"]} />
          <MetricCell label="Temporal refs" value={ledger.sourceCounts["temporal-window"]} />
          <MetricCell label="Lineage refs" value={lineageCount} />
        </div>
        <button type="button" onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export evidence ledger
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {evidenceSourceOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSourceFilterChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-black transition",
              sourceFilter === option.value
                ? "border-cyanGlow/60 bg-cyanGlow/12 text-foreground"
                : "border-cardBorder/40 bg-background/30 text-muted hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {snippets.length > 0 ? (
        <div className="grid max-h-[36rem] gap-3 overflow-auto pr-1">
          {snippets.map((snippet, index) => (
            <div key={`${snippet.source}-${snippet.sourceId}-${snippet.id}-${index}`} className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-[0.68rem] font-black", evidenceSourceCopy[snippet.source].className)}>
                    {evidenceSourceCopy[snippet.source].label}
                  </span>
                  <span className="text-xs font-black text-foreground">{snippet.sourceLabel}</span>
                </div>
                <span className="text-xs font-semibold text-muted">{snippet.stage}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/84">{snippet.text}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold text-muted">
                <span className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">{snippet.label}</span>
                {snippet.personId && <span className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">person {snippet.personId}</span>}
                {snippet.codes?.map((code) => (
                  <span key={`${snippet.id}-${code}`} className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">{code}</span>
                ))}
              </div>
              <EvidenceLineageBadges snippet={snippet} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
          No evidence snippets for this source in the current analysis window.
        </div>
      )}

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        Evidence ledger entries are ordered by model salience, then pair and temporal evidence. Use them as a human-review queue before turning SENA patterns into research claims.
      </div>
    </div>
  );
}

function EvidenceLineageBadges({ snippet }: { snippet: SenaEvidenceSnippet }) {
  if (!snippet.lineage) return null;
  const related = snippet.lineage.related;
  const badges = [
    `table ${snippet.lineage.table}`,
    `row ${snippet.lineage.rowId}`,
    related?.utteranceId ? `utterance ${related.utteranceId}` : null,
    related?.segmentId ? `segment ${related.segmentId}` : null,
    related?.interactionId ? `interaction ${related.interactionId}` : null,
    related?.personId ? `person ${related.personId}` : null,
    related?.windowId ? `window ${related.windowId}` : null,
    related?.codeIds?.length ? `codes ${related.codeIds.join(", ")}` : null
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <div data-testid="evidence-lineage" data-visual-role="five-table-evidence-lineage" className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold text-cyanGlow">
      {badges.map((badge) => (
        <span key={`${snippet.id}-${badge}`} className="rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1">
          {badge}
        </span>
      ))}
    </div>
  );
}

function DualLensDashboard({
  model,
  enaManifest,
  snaManifest,
  activeWindow,
  activeWindowIndex,
  windowCount,
  surface = "section"
}: {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  activeWindow?: SenaTemporalWindow;
  activeWindowIndex: number;
  windowCount: number;
  surface?: "central" | "section";
}) {
  const peopleById = new Map(model.people.map((person) => [person.id, person]));
  const utterances = [...model.utterances].sort((a, b) => a.turnIndex - b.turnIndex || a.id.localeCompare(b.id));
  const topActors = [...model.socialReport.actors]
    .sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 4);
  const activePairs = model.pairReport
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
  const highlightedPair = model.pairReport.find((pair) => pair.id === "evidence|explanation" && pair.totalContribution > 0) ?? activePairs[0];
  const conceptEdges = model.edges
    .filter((edge) => edge.layer === "concept")
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, 4);
  const activeWindowLabel = activeWindow ? activeWindow.label : "Full conversation";
  const activeTurnLabel = activeWindow ? `${activeWindow.startTurn}-${activeWindow.endTurn}` : "All";
  const runtimeLensRows = [
    {
      id: "jsna",
      label: "jSNA social lens",
      value: `${snaManifest.datasetCounts.weightedTies} ties`,
      detail: `${snaManifest.engineAlias}/${snaManifest.engine} ${snaManifest.engineVersion}`,
      className: "border-blue-200 bg-blue-50 text-blue-800"
    },
    {
      id: "jena",
      label: "jENA epistemic lens",
      value: `${enaManifest.outputs?.lineWeights.length ?? 0} W rows`,
      detail: `${enaManifest.engine} ${enaManifest.engineVersion}`,
      className: "border-violet-200 bg-violet-50 text-violet-800"
    },
    {
      id: "sena",
      label: "SENA bridge lens",
      value: `${model.summary.bridgeEdges} B edges`,
      detail: `G pairs ${activePairs.length}; A_fusion ${model.matrices.fusion.values.length}x${model.matrices.fusion.values.length}`,
      className: "border-cyan-200 bg-cyan-50 text-cyan-800"
    }
  ];

  return (
    <div
      data-testid={surface === "central" ? "central-dual-lens-dashboard" : "dual-lens-dashboard"}
      data-visual-role="dual-lens-dashboard"
      data-window-label={activeWindowLabel}
      data-window-turns={activeTurnLabel}
      className={surface === "central" ? "grid gap-4" : "mb-5"}
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-black text-cyanGlow">{surface === "central" ? "Dual Lens Plot" : "Dual Lens Dashboard"}</div>
          <h2 className="mt-2 text-2xl font-black text-foreground sm:text-3xl">Window-scoped conversation, SNA, and ENA</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCell label="Window" value={activeWindowLabel} />
          <MetricCell label="Turns" value={activeTurnLabel} />
          <MetricCell label="Frame" value={windowCount > 0 ? `${activeWindowIndex + 1}/${windowCount}` : "0/0"} />
          <MetricCell label="Segments" value={model.dataset.coded_segments.length} />
        </div>
      </div>

      <div
        data-testid={surface === "central" ? "central-dual-lens-runtime" : "dual-lens-runtime"}
        data-visual-role="dual-lens-runtime-handoff"
        className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-3"
      >
        {runtimeLensRows.map((row) => (
          <div key={row.id} className={cn("min-w-0 rounded-lg border p-3", row.className)}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase">{row.label}</span>
              <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[0.64rem] font-black uppercase">{row.id}</span>
            </div>
            <div className="mt-2 text-base font-black text-slate-950">{row.value}</div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-600" title={row.detail}>{row.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.45fr]">
        <Panel title="Raw Conversation Stream" icon={FileText}>
          {utterances.length > 0 ? (
            <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
              {utterances.map((utterance) => (
                <div key={utterance.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
                    <span>Turn {utterance.turnIndex}</span>
                    <span>{peopleById.get(utterance.personId)?.label ?? utterance.personId} - {utterance.stage}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground/84">{utterance.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
              Upload utterance rows to populate the conversation stream.
            </div>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="SNA Split View" icon={Network}>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Ties" value={model.socialReport.graph.tieCount} />
              <MetricCell label="Density" value={formatNumber(model.socialReport.graph.density)} />
              <MetricCell label="Avg path" value={formatNumber(model.socialReport.graph.averagePathLength)} />
              <MetricCell label="Communities" value={model.socialReport.graph.communityCount} />
            </div>
            <div className="mt-4 grid gap-2">
              {topActors.length > 0 ? topActors.map((actor) => (
                <div key={actor.id} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{actor.label}</span>
                  <span className="text-right font-semibold text-muted">S {formatNumber(actor.strength, 1)}</span>
                  <span className="text-right font-semibold text-muted">D {formatNumber(actor.degree, 1)}</span>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No social ties in this window.</div>
              )}
            </div>
          </Panel>

          <Panel title="ENA Split View" icon={Sigma}>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Code edges" value={model.summary.conceptEdges} />
              <MetricCell label="Active G pairs" value={activePairs.length} />
              <MetricCell label="Bridge edges" value={model.summary.bridgeEdges} />
              <MetricCell label="G total" value={formatNumber(activePairs.reduce((total, pair) => total + pair.totalContribution, 0), 1)} />
            </div>
            <div className="mt-4 grid gap-2">
              {conceptEdges.length > 0 ? conceptEdges.map((edge) => (
                <div key={edge.id} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{edge.label}</span>
                  <span className="text-right font-semibold text-muted">{formatNumber(edge.weight, 1)}</span>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No ENA co-occurrences in this window.</div>
              )}
            </div>
          </Panel>

          <Panel title="Evidence-Explanation Drivers" icon={GitMerge} className="lg:col-span-2">
            {highlightedPair ? (
              <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <div className="text-xs font-black uppercase text-muted">Code pair</div>
                  <div className="mt-2 text-lg font-black text-foreground">{highlightedPair.label}</div>
                  <div className="mt-2 text-sm font-semibold text-muted">Total G {formatNumber(highlightedPair.totalContribution, 1)}</div>
                </div>
                <div className="grid gap-2">
                  {highlightedPair.topContributors.map((contributor) => (
                    <div key={contributor.id} className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-3 md:grid-cols-[1fr_5rem_5rem_5rem] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-foreground">{contributor.label}</div>
                        <div className="mt-1 truncate text-xs font-semibold text-muted">
                          {contributor.evidence.map((snippet) => snippet.label).join(", ") || "No snippet"}
                        </div>
                      </div>
                      <span className="text-sm font-black text-cyanGlow">G {formatNumber(contributor.weight, 1)}</span>
                      <span className="text-sm font-semibold text-foreground/78">Direct {formatNumber(contributor.directWeight, 1)}</span>
                      <span className="text-sm font-semibold text-foreground/78">Support {formatNumber(contributor.supportingWeight, 1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No person-code-pair contribution in this window.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function edgeMatrixProvenance(edge: SenaEdge, options: SenaModel["options"]) {
  if (edge.layer === "social") {
    return {
      source: "jSNA / sna.js",
      block: "S person-person block",
      fingerprintId: "S" as const,
      factor: `alpha ${formatNumber(options.alpha)}`,
      fusionSlot: "top-left A_fusion block",
      guardrail: "Read as observed social structure, not epistemic quality."
    };
  }
  if (edge.layer === "concept") {
    return {
      source: "jENA aligned",
      block: "W code-code block",
      fingerprintId: "W" as const,
      factor: `beta ${formatNumber(options.beta)}`,
      fusionSlot: "bottom-right A_fusion block",
      guardrail: "Read with code reliability and jENA manifest settings."
    };
  }
  return {
    source: "SENA bridge",
    block: "B person-code block",
    fingerprintId: "B" as const,
    factor: `gamma ${formatNumber(options.gamma)}`,
    fusionSlot: "off-diagonal A_fusion blocks",
    guardrail: "Read as contribution linkage before turning it into a claim."
  };
}

function JenaConceptPairEvidencePanel({ handoff }: { handoff: SenaJenaConceptPairHandoffRow }) {
  return (
    <div
      data-testid="concept-edge-jena-handoff"
      data-visual-role="concept-edge-jena-pair-handoff"
      data-overlap-status={handoff.overlapStatus}
      data-adjacency-column={handoff.adjacencyColumn ?? "missing"}
      data-jena-connection-total={handoff.jenaConnectionTotal}
      data-jena-line-weight-total={handoff.jenaLineWeightTotal}
      data-sena-w-weight={handoff.senaRawWeight}
      className="rounded-lg border border-violet-300/25 bg-violet-300/10 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-foreground">jENA pair evidence</h4>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            jENA adjacency and unit connection counts matched to this SENA W edge.
          </div>
        </div>
        <span className="rounded-full border border-violet-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-violet-100">
          {handoff.overlapStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="jENA column" value={handoff.adjacencyColumn ?? "missing"} />
        <MetricCell label="jENA count" value={formatNumber(handoff.jenaConnectionTotal, 1)} />
        <MetricCell label="jENA line" value={formatNumber(handoff.jenaLineWeightTotal, 3)} />
        <MetricCell label="SENA W raw" value={formatNumber(handoff.senaRawWeight, 1)} />
      </div>

      <div className="mt-3 grid gap-2">
        {handoff.unitPreview.length > 0 ? handoff.unitPreview.slice(0, 3).map((entry) => (
          <div key={`${handoff.id}-${entry.unit}`} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] gap-2 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
            <div className="min-w-0 truncate font-black text-foreground">{entry.unit}</div>
            <div className="text-right font-semibold text-muted">c {formatNumber(entry.connectionCount, 1)}</div>
            <div className="text-right font-semibold text-muted">lw {formatNumber(entry.lineWeight, 2)}</div>
          </div>
        )) : (
          <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
            No positive jENA unit rows are recorded for this pair in the active window.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
        {handoff.guardrail}
      </div>
    </div>
  );
}

function JsnaSocialActorMetrics({
  title,
  actor
}: {
  title: string;
  actor: SenaJsnaSocialTieHandoffRow["sourceActor"];
}) {
  return (
    <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-3">
      <div className="text-xs font-black text-foreground">{title}</div>
      <div className="mt-1 truncate text-xs font-semibold text-muted">{actor?.label ?? "missing actor"}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="font-black text-foreground">{actor ? formatNumber(actor.degree, 1) : "0"}</div>
          <div className="font-semibold text-muted">degree</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor ? formatNumber(actor.strength, 1) : "0"}</div>
          <div className="font-semibold text-muted">strength</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor ? formatNumber(actor.closeness, 3) : "0"}</div>
          <div className="font-semibold text-muted">closeness</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor?.community ?? "n/a"}</div>
          <div className="font-semibold text-muted">community</div>
        </div>
      </div>
    </div>
  );
}

function JsnaSocialTieEvidencePanel({ handoff }: { handoff: SenaJsnaSocialTieHandoffRow }) {
  return (
    <div
      data-testid="social-edge-jsna-handoff"
      data-visual-role="social-edge-jsna-tie-handoff"
      data-matrix-aligned={handoff.matrixAligned ? "true" : "false"}
      data-edge-weight={handoff.edgeWeight}
      data-social-matrix-weight={handoff.socialMatrixWeight}
      data-manifest-matrix-weight={handoff.manifestMatrixWeight}
      data-evidence-count={handoff.evidencePreview.length}
      className="rounded-lg border border-blue-300/25 bg-blue-300/10 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-foreground">jSNA tie evidence</h4>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            jSNA social matrix and actor metrics matched to this SENA S edge.
          </div>
        </div>
        <span className="rounded-full border border-blue-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-blue-100">
          {handoff.matrixAligned ? "aligned" : "review"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="S matrix" value={formatNumber(handoff.socialMatrixWeight, 1)} />
        <MetricCell label="jSNA matrix" value={formatNumber(handoff.manifestMatrixWeight, 1)} />
        <MetricCell label="Evidence refs" value={handoff.evidencePreview.length} />
        <MetricCell label="Mode" value={handoff.graphMode} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <JsnaSocialActorMetrics title="Source actor" actor={handoff.sourceActor} />
        <JsnaSocialActorMetrics title="Target actor" actor={handoff.targetActor} />
      </div>

      <div className="mt-3 grid gap-2">
        {handoff.evidencePreview.length > 0 ? handoff.evidencePreview.slice(0, 3).map((entry) => (
          <div key={`${handoff.id}-${entry.id}`} className="rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate font-black text-foreground">{entry.label}</div>
              <div className="shrink-0 font-semibold text-muted">{entry.stage}</div>
            </div>
            <div className="mt-1 line-clamp-2 font-semibold leading-5 text-muted">{entry.text}</div>
          </div>
        )) : (
          <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
            No source interaction snippets are attached to this social tie.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
        {handoff.guardrail}
      </div>
    </div>
  );
}

function Inspector({
  selected,
  options,
  pairReport,
  matrixFingerprints,
  edgeStrokeScale,
  jenaConceptPairHandoffRows,
  jsnaSocialTieHandoffRows
}: {
  selected: SenaNode | SenaEdge;
  options: SenaModel["options"];
  pairReport: SenaModel["pairReport"];
  matrixFingerprints: SenaMatrixFingerprint[];
  edgeStrokeScale: EdgeStrokeScale;
  jenaConceptPairHandoffRows: SenaJenaConceptPairHandoffRow[];
  jsnaSocialTieHandoffRows: SenaJsnaSocialTieHandoffRow[];
}) {
  if ("layer" in selected) {
    const provenance = edgeMatrixProvenance(selected, options);
    const blockFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === provenance.fingerprintId);
    const fusionFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
    const gFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === "G");
    const selectedPair = selected.layer === "concept"
      ? pairReport.find((pair) => (
        (pair.codeA === selected.source && pair.codeB === selected.target) ||
        (pair.codeA === selected.target && pair.codeB === selected.source)
      ))
      : undefined;
    const selectedJenaHandoff = selected.layer === "concept"
      ? jenaConceptPairHandoffRows.find((row) => row.id === conceptPairKey(selected.source, selected.target))
      : undefined;
    const selectedJsnaHandoff = selected.layer === "social"
      ? jsnaSocialTieHandoffRows.find((row) => row.id === selected.id)
      : undefined;
    const visualSalience = readableEdgeStrokeSignal(selected, edgeStrokeScale);
    const visualWidth = readableEdgeStrokeWidth(selected, edgeStrokeScale);
    const visualBasis = selected.layer === "concept" && selectedPair
      ? `W scaled ${formatNumber(selected.scaledWeight)} + G ${formatNumber(selectedPair.totalContribution, 1)}`
      : `${selected.layer.toUpperCase()} scaled ${formatNumber(selected.scaledWeight)}`;

    return (
      <div data-testid="sena-inspector" className="grid gap-4">
        <div>
          <div className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-black", layerCopy[selected.layer].className)}>
            {layerCopy[selected.layer].label}
          </div>
          <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{layerCopy[selected.layer].detail}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="Raw weight" value={formatNumber(selected.weight, 1)} />
          <MetricCell label="Normalized" value={formatNumber(selected.normalizedWeight)} />
          <MetricCell label="Scaled" value={formatNumber(selected.scaledWeight)} />
        </div>
        <div data-testid="edge-visual-stroke-provenance" data-visual-role="edge-visual-stroke-provenance" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-foreground">Line weight provenance</h4>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                Layer-relative salience used by the current Fusion Canvas stroke.
              </div>
            </div>
            <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2.5 py-1 text-xs font-black text-cyanGlow">
              {formatNumber(visualWidth, 1)} px
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCell label="Visual salience" value={formatNumber(visualSalience, 4)} />
            <MetricCell label="Stroke width" value={`${formatNumber(visualWidth, 1)} px`} />
          </div>
          <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
            Basis: {visualBasis}. Concept links keep raw W intact; G is used only as a visual tie-breaker when active W values are tied.
          </div>
        </div>
        <div data-testid="edge-matrix-provenance" data-visual-role="edge-matrix-provenance" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-foreground">Matrix provenance</h4>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                Selected edge contribution inside the current SENA fusion model.
              </div>
            </div>
            <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2.5 py-1 text-xs font-black text-cyanGlow">
              {selected.layer.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCell label="Runtime source" value={provenance.source} />
            <MetricCell label="Matrix block" value={provenance.block} />
            <MetricCell label="Formula factor" value={provenance.factor} />
            <MetricCell label="Fusion slot" value={provenance.fusionSlot} />
          </div>
          <div data-testid="edge-matrix-fingerprint" data-visual-role="edge-matrix-fingerprint" className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-2">
              <div className="text-xs font-black text-foreground">Matrix fingerprint</div>
              <div className="mt-1 font-mono text-xs font-black text-cyanGlow">{blockFingerprint?.checksum ?? "missing"}</div>
              <div className="mt-1 text-xs font-semibold text-muted">{blockFingerprint?.id ?? provenance.fingerprintId} block; {blockFingerprint?.shape ?? "unknown shape"}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-2">
              <div className="text-xs font-black text-foreground">A_fusion fingerprint</div>
              <div className="mt-1 font-mono text-xs font-black text-cyanGlow">{fusionFingerprint?.checksum ?? "missing"}</div>
              <div className="mt-1 text-xs font-semibold text-muted">{fusionFingerprint?.shape ?? "unknown shape"} weighted block matrix</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
            {provenance.guardrail}
          </div>
          <div className="mt-2 rounded-lg border border-fuchsia-300/20 bg-fuchsia-300/10 p-2 text-xs font-semibold leading-5 text-muted">
            Concept edges show G attribution for person-code-pair contribution when selected.
          </div>
        </div>
        {selectedJsnaHandoff && <JsnaSocialTieEvidencePanel handoff={selectedJsnaHandoff} />}
        {selectedJenaHandoff && <JenaConceptPairEvidencePanel handoff={selectedJenaHandoff} />}
        {selectedPair && (
          <div data-testid="concept-edge-g-attribution" data-visual-role="concept-edge-g-attribution" className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/10 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-foreground">G attribution</h4>
                <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                  Person-code-pair contribution explaining who supports this ENA concept link.
                </div>
              </div>
              <span className="rounded-full border border-fuchsia-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-fuchsia-100">
                G {formatNumber(selectedPair.totalContribution, 1)}
              </span>
            </div>
            <div className="grid gap-2">
              {selectedPair.topContributors.length > 0 ? selectedPair.topContributors.slice(0, 3).map((contributor) => (
                <div key={contributor.id} className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-black text-foreground">{contributor.label}</div>
                    <div className="mt-1 truncate font-semibold text-muted">
                      Direct {formatNumber(contributor.directWeight, 1)} · Support {formatNumber(contributor.supportingWeight, 1)}
                    </div>
                  </div>
                  <div className="text-right font-black text-fuchsia-100">{formatNumber(contributor.weight, 1)}</div>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
                  No person-code-pair contributor is recorded for this concept link.
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
              G is an explanatory attribution layer; inspect evidence snippets before making claims about people or groups.
            </div>
            <div className="mt-2 rounded-lg border border-fuchsia-300/20 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
              <span className="font-black text-foreground">G fingerprint:</span> <span className="font-mono font-black text-fuchsia-100">{gFingerprint?.checksum ?? "missing"}</span>
            </div>
          </div>
        )}
        <div>
          <h4 className="mb-2 text-sm font-black text-foreground">Evidence</h4>
          <div className="grid max-h-72 gap-2 overflow-auto pr-1">
            {selected.evidence.map((snippet) => (
              <div key={snippet.id} className="rounded-lg border border-cardBorder/35 bg-background/35 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-black text-muted">
                  <span>{snippet.label}</span>
                  <span>{snippet.stage}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/82">{snippet.text}</p>
                <EvidenceLineageBadges snippet={snippet} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selected.kind === "person") {
    return (
      <div data-testid="sena-inspector" className="grid gap-4">
        <div>
          <div className="inline-flex rounded-full border border-blue-400/45 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-200">
            Person
          </div>
          <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{selected.role} - {selected.group}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCell label="Bridge score" value={formatNumber(selected.metrics.bridgeScore)} />
          <MetricCell label="S strength" value={formatNumber(selected.metrics.socialStrength, 1)} />
          <MetricCell label="SNA degree" value={formatNumber(selected.metrics.socialDegree, 1)} />
          <MetricCell label="Betweenness" value={formatNumber(selected.metrics.socialBetweenness)} />
          <MetricCell label="Closeness" value={formatNumber(selected.metrics.socialCloseness)} />
          <MetricCell label="Community" value={selected.metrics.socialCommunity >= 0 ? selected.metrics.socialCommunity + 1 : "NA"} />
          <MetricCell label="B contribution" value={formatNumber(selected.metrics.epistemicContribution, 1)} />
          <MetricCell label="Alignment" value={formatNumber(selected.metrics.alignment)} />
        </div>
        <div className="grid gap-3">
          <RankedList title="Top codes" rows={selected.metrics.topCodes.map((row) => [row.label, row.weight])} />
          <RankedList title="Top interactors" rows={selected.metrics.topInteractors.map((row) => [row.label, row.weight])} />
          <RankedList title="Top code-pairs" rows={selected.metrics.topPairs.map((row) => [row.label, row.weight])} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="sena-inspector" className="grid gap-4">
      <div>
        <div className="inline-flex rounded-full border border-violetGlow/45 bg-violetGlow/10 px-3 py-1 text-xs font-black text-violetGlow">
          Concept
        </div>
        <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{selected.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="ENA degree" value={formatNumber(selected.metrics.weightedDegree, 1)} />
        <MetricCell label="B total" value={formatNumber(selected.metrics.totalContribution, 1)} />
      </div>
      <RankedList title="Top co-occurring concepts" rows={selected.metrics.topCooccurring.map((row) => [row.label, row.weight])} />
      <RankedList title="Top contributors" rows={selected.metrics.topContributors.map((row) => [row.label, row.weight])} />
    </div>
  );
}

function RankedList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-black text-foreground">{title}</h4>
      <div className="grid gap-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No values yet.</div>
        ) : rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-bold text-foreground/86">{label}</span>
            <span className="text-right font-black text-cyanGlow">{formatNumber(value, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FusionLayerKey({
  model,
  layers,
  threshold,
  alpha,
  beta,
  gamma
}: {
  model: SenaModel;
  layers: LayerVisibility;
  threshold: number;
  alpha: number;
  beta: number;
  gamma: number;
}) {
  const layerCounts = {
    social: model.edges.filter((edge) => edge.layer === "social" && edge.normalizedWeight >= threshold).length,
    concept: model.edges.filter((edge) => edge.layer === "concept" && edge.normalizedWeight >= threshold).length,
    bridge: model.edges.filter((edge) => edge.layer === "bridge" && edge.normalizedWeight >= threshold).length
  };
  const activeGPairs = model.pairReport.filter((pair) => pair.totalContribution > 0).length;
  const strongestGPair = [...model.pairReport].sort((a, b) => b.totalContribution - a.totalContribution)[0];
  const items = [
    {
      id: "s",
      token: "S",
      label: "SNA outer arcs",
      detail: "person-person ties",
      count: layerCounts.social,
      weight: `alpha ${formatNumber(alpha)}`,
      active: layers.social,
      className: "border-blue-300 bg-blue-50 text-blue-800",
      lineClassName: "bg-[#2f73ff] shadow-[0_0_12px_rgba(47,115,255,0.35)]",
      visualRole: "fusion-layer-key-social"
    },
    {
      id: "w",
      token: "W",
      label: "W solid ENA mesh",
      detail: "code-code co-occurrence",
      count: layerCounts.concept,
      weight: `beta ${formatNumber(beta)}`,
      active: layers.concept,
      className: "border-violet-300 bg-violet-50 text-violet-800",
      lineClassName: "bg-gradient-to-r from-[#735cf6] to-[#b14cf1] shadow-[0_0_12px_rgba(137,93,255,0.35)]",
      visualRole: "fusion-layer-key-ena"
    },
    {
      id: "b",
      token: "B",
      label: "B bridge ribbons",
      detail: "person-code contribution",
      count: layerCounts.bridge,
      weight: `gamma ${formatNumber(gamma)}`,
      active: layers.bridge,
      className: "border-cyan-300 bg-cyan-50 text-cyan-800",
      lineClassName: "bg-gradient-to-r from-cyanGlow via-violetGlow to-fuchsia-400 opacity-80",
      visualRole: "fusion-layer-key-bridge"
    },
    {
      id: "g",
      token: "G",
      label: "G pair contribution",
      detail: strongestGPair ? strongestGPair.label : "person-code-pair drivers",
      count: activeGPairs,
      weight: "temporal trace",
      active: true,
      className: "border-rose-300 bg-rose-50 text-rose-800",
      lineClassName: "bg-gradient-to-r from-rose-400 to-fuchsia-400 shadow-[0_0_12px_rgba(251,113,133,0.28)]",
      visualRole: "fusion-layer-key-g"
    }
  ];

  return (
    <div data-testid="fusion-layer-key" data-visual-role="fusion-layer-key-a1" className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 text-xs font-black text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="uppercase text-slate-950">A1 Inner Solid Mesh</div>
          <div className="mt-1 font-semibold normal-case text-slate-600">{"A_fusion = [alpha*S gamma*B; gamma*B' beta*W]"}</div>
        </div>
        <div data-testid="fusion-layer-key-threshold" className="inline-flex w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-950">
          Threshold {formatNumber(threshold)}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.id}
            data-visual-role={item.visualRole}
            className={cn("grid min-h-28 gap-2 rounded-lg border p-3 text-xs", item.className, !item.active && "opacity-45")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white font-black text-slate-700">
                {item.token}
              </span>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-1 font-black text-slate-700">{item.count}</span>
            </div>
            <span className={cn("h-1.5 w-full rounded-full", item.lineClassName)} />
            <div>
              <div className="font-black text-slate-950">{item.label}</div>
              <div className="mt-1 font-semibold leading-5 text-slate-600">{item.detail}</div>
              <div className="mt-1 font-black text-slate-700">{item.weight}</div>
            </div>
          </div>
        ))}
      </div>
      <div data-testid="fusion-layer-key-line-weight-note" data-visual-role="fusion-layer-key-line-weight-note" className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
        Line thickness is layer-relative salience; selected edges expose raw, normalized, scaled, salience, and stroke-width provenance.
      </div>
    </div>
  );
}

function Canvas({
  model,
  layout,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onSelect,
  zoom = 1,
  className
}: {
  model: SenaModel;
  layout: SenaLayoutMode;
  enaManifest: SenaEnaManifest;
  layers: LayerVisibility;
  threshold: number;
  selectedId: string;
  revealedLabelIds: string[];
  onSelect: (id: string) => void;
  zoom?: number;
  className?: string;
}) {
  const nodes = useMemo(() => computeLayout(model, layout, enaManifest), [enaManifest, layout, model]);
  const positions = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const revealedLabelSet = useMemo(() => new Set(revealedLabelIds), [revealedLabelIds]);
  const edges = model.edges.filter((edge) => layers[edge.layer] && edge.normalizedWeight >= threshold);
  const conceptPairContributions = useMemo(() => buildConceptPairContributionMap(model), [model]);
  const conceptEdges = edges.filter((edge) => edge.layer === "concept");
  const socialEdges = edges.filter((edge) => edge.layer === "social");
  const bridgeEdges = edges.filter((edge) => edge.layer === "bridge");
  const edgeStrokeScale = buildEdgeStrokeScale(edges, conceptPairContributions);
  const safeZoom = clampFusionPlotZoom(zoom);
  const viewBoxWidth = width / safeZoom;
  const viewBoxHeight = height / safeZoom;
  const viewBoxX = center.x - viewBoxWidth / 2;
  const viewBoxY = center.y - viewBoxHeight / 2;

  return (
    <svg
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      className={cn("h-[40rem] w-full max-w-full", className)}
      role="img"
      aria-label="SENA Fusion Canvas"
      data-testid="sena-fusion-canvas"
      data-visual-scope="sena-fusion"
      data-plot-zoom={safeZoom.toFixed(3)}
    >
      <defs>
        <linearGradient id="concept-link-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#735cf6" />
          <stop offset="100%" stopColor="#b14cf1" />
        </linearGradient>
        <linearGradient id="bridge-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#24dcee" />
          <stop offset="54%" stopColor="#5bd7ff" />
          <stop offset="100%" stopColor="#78adff" />
        </linearGradient>
        <filter id="concept-link-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0.50 0 0 0 0.18 0 0.25 0 0 0.10 0 0 0.85 0 0.75 0 0 0 0.52 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="social-link-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0.12 0 0 0 0.04 0 0.36 0 0 0.18 0 0 0.95 0 0.90 0 0 0 0.38 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={viewBoxHeight} rx="8" fill="rgb(var(--background) / 0.42)" />
      <rect x="0" y="0" width={width} height={height} rx="8" fill="rgb(var(--background) / 0.18)" />
      <g opacity="0.32">
        {Array.from({ length: 15 }, (_, index) => index * 64).map((x) => (
          <line key={`x-${x}`} x1={x} x2={x} y1="0" y2={height} stroke="rgb(var(--foreground) / 0.08)" />
        ))}
        {Array.from({ length: 11 }, (_, index) => index * 62).map((y) => (
          <line key={`y-${y}`} x1="0" x2={width} y1={y} y2={y} stroke="rgb(var(--foreground) / 0.08)" />
        ))}
      </g>
      <circle
        cx={center.x}
        cy={center.y}
        r={conceptGuideRadius}
        fill="none"
        stroke="#895dff"
        strokeOpacity="0.34"
        strokeWidth="1.5"
        strokeDasharray="8 12"
        data-testid="sena-fusion-center-guide"
        data-layer="concept"
        data-visual-role="concept-space-guide"
      />

      <g>
        {bridgeEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.88)"
                strokeWidth={strokeWidth + 7}
                strokeLinecap="round"
                opacity="0.9"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="person-code-bridge-ribbon"
                data-edge-weight={formatNumber(edge.weight)}
                data-edge-normalized-weight={formatNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatNumber(strokeSignal, 4)}
                data-edge-visual-width={formatNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={selectedId === edge.id ? 0.95 : 0.42 + edge.normalizedWeight * 0.34}
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer transition-opacity"
              >
                <title>{`${edge.label}; weight ${formatNumber(edge.weight)}, scaled ${formatNumber(edge.scaledWeight)}, visual width ${formatNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
        {conceptEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.94)"
                strokeWidth={strokeWidth + 8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="ena-solid-concept-link"
                data-edge-weight={formatNumber(edge.weight)}
                data-edge-normalized-weight={formatNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatNumber(strokeSignal, 4)}
                data-edge-visual-width={formatNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={selectedId === edge.id ? 0.98 : 0.68 + edge.normalizedWeight * 0.24}
                filter="url(#concept-link-glow)"
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer"
              >
                <title>{`${edge.label}; weight ${formatNumber(edge.weight)}, scaled ${formatNumber(edge.scaledWeight)}, visual width ${formatNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
        {socialEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.9)"
                strokeWidth={strokeWidth + 7}
                strokeLinecap="round"
                opacity="0.9"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="outer-social-arc"
                data-arc-route="outer-orbit"
                data-edge-weight={formatNumber(edge.weight)}
                data-edge-normalized-weight={formatNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatNumber(strokeSignal, 4)}
                data-edge-visual-width={formatNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={selectedId === edge.id ? 0.98 : 0.72 + edge.normalizedWeight * 0.2}
                filter="url(#social-link-glow)"
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer"
              >
                <title>{`${edge.label}; weight ${formatNumber(edge.weight)}, scaled ${formatNumber(edge.scaledWeight)}, visual width ${formatNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
      </g>

      <g>
	        {nodes.map((node) => {
	          const selected = selectedId === node.id;
	          const radius = nodeRadius(node);
	          if (node.kind === "concept") {
	            const showReadableLabel = selected || revealedLabelSet.has(node.id);
	            const labelWidth = readableLabelWidth(node.label, 82, 152);
            const labelOffset = node.y > center.y + 86 ? -(radius + 18) : radius + 20;
            const labelY = node.y + labelOffset;
            const glyph = readableConceptGlyph(node.label);
            return (
              <g
                key={node.id}
                data-testid={`sena-node-${node.id}`}
                data-node-kind={node.kind}
                data-node-label={node.label}
                data-node-glyph={glyph}
                onClick={() => onSelect(node.id)}
                className="cursor-pointer"
                filter={selected ? "url(#node-glow)" : undefined}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={node.color}
                  opacity="0.94"
                  stroke={selected ? "#ffffff" : "rgb(var(--background))"}
                  strokeWidth={selected ? 4 : 2}
                  data-visual-role="ena-concept-circle-node"
                />
                <text x={node.x} y={node.y + (glyph.length > 1 ? 5 : 8)} textAnchor="middle" fill="white" fontSize={glyph.length > 1 ? 17 : 26} fontWeight="950">
                  {glyph}
                </text>
                {showReadableLabel && (
                  <g data-testid="fusion-selected-node-label" data-node-id={node.id} data-selected={selected ? "true" : "false"}>
                    <rect
                      x={node.x - labelWidth / 2}
                      y={labelY - 13}
                      width={labelWidth}
                      height="27"
                      rx="13.5"
                      fill="rgb(var(--background) / 0.94)"
                      stroke="rgb(var(--foreground) / 0.14)"
                      strokeWidth="1"
                      data-visual-role="fusion-readable-label-plate"
                    />
                    <text x={node.x} y={labelY + 5} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="12.5" fontWeight="900">
                      {node.label}
                    </text>
                  </g>
                )}
                <title>{node.description}</title>
              </g>
            );
	          }

	          const labelWidth = readableLabelWidth(node.label, 78, 154);
	          const labelY = node.y + radius + 24;
	          const showReadableLabel = selected || revealedLabelSet.has(node.id);
	          return (
            <g key={node.id} data-testid={`sena-node-${node.id}`} data-node-kind={node.kind} onClick={() => onSelect(node.id)} className="cursor-pointer" filter={selected ? "url(#node-glow)" : undefined}>
              <polygon
                points={hexPoints(node.x, node.y, radius + 6)}
                fill="rgb(var(--background) / 0.72)"
                stroke="#24dcee"
                strokeWidth={selected ? 4 : 2}
                data-visual-role="sna-person-hex-node"
              />
              <polygon
                points={hexPoints(node.x, node.y, radius)}
                fill="#f8fbff"
              />
              <text x={node.x} y={node.y + 7} textAnchor="middle" fill="#0f172a" fontSize="18" fontWeight="950">
                {node.initials}
              </text>
                {showReadableLabel && (
                  <g data-testid="fusion-selected-node-label" data-node-id={node.id} data-selected={selected ? "true" : "false"}>
                  <rect
                    x={node.x - labelWidth / 2}
                    y={labelY - 14}
                    width={labelWidth}
                    height="28"
                    rx="14"
                    fill="rgb(var(--background) / 0.94)"
                    stroke="rgb(var(--foreground) / 0.14)"
                    strokeWidth="1"
                    data-visual-role="fusion-readable-label-plate"
                  />
                  <text x={node.x} y={labelY + 5} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="13" fontWeight="900">
                    {node.label}
                  </text>
                </g>
              )}
              <title>{`${node.label}: ${node.role}`}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function FusionPlotCompactKey({
  model,
  layers,
  threshold,
  alpha,
  beta,
  gamma
}: {
  model: SenaModel;
  layers: LayerVisibility;
  threshold: number;
  alpha: number;
  beta: number;
  gamma: number;
}) {
  const layerCounts = {
    social: model.edges.filter((edge) => edge.layer === "social" && edge.normalizedWeight >= threshold).length,
    concept: model.edges.filter((edge) => edge.layer === "concept" && edge.normalizedWeight >= threshold).length,
    bridge: model.edges.filter((edge) => edge.layer === "bridge" && edge.normalizedWeight >= threshold).length
  };
  const activeGPairs = model.pairReport.filter((pair) => pair.totalContribution > 0).length;
  const items = [
    {
      token: "S",
      label: "SNA arcs",
      value: layerCounts.social,
      weight: `alpha ${formatNumber(alpha)}`,
      active: layers.social,
      className: "border-blue-300 bg-blue-50 text-blue-900"
    },
    {
      token: "W",
      label: "ENA mesh",
      value: layerCounts.concept,
      weight: `beta ${formatNumber(beta)}`,
      active: layers.concept,
      className: "border-violet-300 bg-violet-50 text-violet-900"
    },
    {
      token: "B",
      label: "Bridge ribbons",
      value: layerCounts.bridge,
      weight: `gamma ${formatNumber(gamma)}`,
      active: layers.bridge,
      className: "border-cyan-300 bg-cyan-50 text-cyan-900"
    },
    {
      token: "G",
      label: "Pair contribution",
      value: activeGPairs,
      weight: "temporal trace",
      active: true,
      className: "border-rose-300 bg-rose-50 text-rose-900"
    }
  ];

  return (
    <div
      data-testid="fusion-maximized-compact-key"
      data-visual-role="fusion-maximized-compact-key"
      className="grid gap-2 rounded-lg border border-slate-200 bg-white/86 p-2 shadow-[0_8px_22px_rgb(15_23_42/0.08)] sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <div
          key={item.token}
          className={cn("flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2", item.className, !item.active && "opacity-45")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-800">
              {item.token}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-black text-slate-950">{item.label}</span>
              <span className="block truncate text-[0.68rem] font-bold text-slate-600">{item.weight}</span>
            </span>
          </div>
          <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-800">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function FusionPlotMaximizedOverlay({
  model,
  layout,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onSelect,
  onClose,
  activeWindowLabel,
  activeTurnLabel,
  alpha,
  beta,
  gamma,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset
}: {
  model: SenaModel;
  layout: SenaLayoutMode;
  enaManifest: SenaEnaManifest;
  layers: LayerVisibility;
  threshold: number;
  selectedId: string;
  revealedLabelIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  activeWindowLabel: string;
  activeTurnLabel: string;
  alpha: number;
  beta: number;
  gamma: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  return (
    <div
      data-testid="fusion-plot-maximized-overlay"
      data-visual-role="fusion-plot-maximized-window"
      role="dialog"
      aria-modal="true"
      aria-label="Maximized Fusion Plot"
      className="fixed inset-0 z-[80] bg-slate-950/62 p-3 backdrop-blur-sm sm:p-5"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/25 bg-[#e8edf3] shadow-[0_24px_80px_rgb(2_6_23/0.45)]">
        <div className="flex min-h-16 flex-col gap-3 border-b border-slate-300 bg-white/82 px-4 py-3 shadow-[0_1px_0_rgb(255_255_255/0.75)_inset] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black uppercase tracking-[0.01em] text-slate-500">Fusion Plot - Current Window</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
              <span>A1 Inner Solid Mesh</span>
              <span>{activeWindowLabel}</span>
              <span>Turns {activeTurnLabel}</span>
              <span>Threshold {formatNumber(threshold)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FusionPlotZoomControls
              zoom={zoom}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onReset={onZoomReset}
              testScope="maximized"
              className="h-9"
            />
            <button
              type="button"
              data-testid="restore-fusion-plot"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 shadow-[0_8px_18px_rgb(15_23_42/0.08)] transition hover:border-cyanGlow/60 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              <Minimize2 className="h-4 w-4" />
              Restore
            </button>
            <button
              type="button"
              data-testid="close-fusion-plot-maximized"
              aria-label="Close maximized Fusion Plot"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-[0_8px_18px_rgb(15_23_42/0.08)] transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-auto p-3 sm:p-4">
          <FusionPlotCompactKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
          <div className="min-h-0 overflow-hidden rounded-lg border border-slate-300/80 bg-slate-50 shadow-[0_16px_38px_rgb(15_23_42/0.12)]">
            <Canvas
              model={model}
              layout={layout}
              enaManifest={enaManifest}
              layers={layers}
	              threshold={threshold}
	              selectedId={selectedId}
	              revealedLabelIds={revealedLabelIds}
	              onSelect={onSelect}
	              zoom={zoom}
              className="h-[calc(100vh-14rem)] min-h-[34rem]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SenaFusionWorkspace() {
  const [dataset, setDataset] = useState(() => lessonStudySenaContract);
  const [uploadedTables, setUploadedTables] = useState<UploadedSenaTable[]>([]);
  const [importMessage, setImportMessage] = useState("Lesson-study sample loaded from the bundled SENA pilot package.");
  const [importError, setImportError] = useState<string | null>(null);
  const [layout, setLayout] = useState<SenaLayoutMode>("explanatory");
  const [normalization, setNormalization] = useState<SenaNormalization>("max");
  const [alpha, setAlpha] = useState(0.72);
  const [beta, setBeta] = useState(0.64);
  const [gamma, setGamma] = useState(0.86);
  const [threshold, setThreshold] = useState(0.16);
  const [temporalMode, setTemporalMode] = useState<SenaTemporalMode>("stage");
  const [movingWindowSize, setMovingWindowSize] = useState(3);
  const [movingWindowStep, setMovingWindowStep] = useState(1);
  const [turnWindowRadius, setTurnWindowRadius] = useState(1);
  const [activeWindowIndex, setActiveWindowIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationMs, setAnimationMs] = useState(1200);
  const [reportTitle, setReportTitle] = useState("SENA Analysis Report");
  const [reviewStatus, setReviewStatus] = useState<SenaReportHumanReview["status"]>("draft");
  const [reviewer, setReviewer] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [limitations, setLimitations] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [dataGovernanceIrbApprovalId, setDataGovernanceIrbApprovalId] = useState("");
  const [dataGovernanceConsentScope, setDataGovernanceConsentScope] = useState("");
  const [dataGovernanceRetentionPolicy, setDataGovernanceRetentionPolicy] = useState("");
  const [dataGovernanceUsageConstraints, setDataGovernanceUsageConstraints] = useState("");
  const [dataGovernanceDataSteward, setDataGovernanceDataSteward] = useState("");
  const [codingReliabilityStatus, setCodingReliabilityStatus] = useState<SenaCodingReliabilityReview["status"]>("not-documented");
  const [codingReliabilityReviewer, setCodingReliabilityReviewer] = useState("");
  const [codingScheme, setCodingScheme] = useState("");
  const [unitOfCoding, setUnitOfCoding] = useState("coded_segments");
  const [coderCount, setCoderCount] = useState(0);
  const [agreementMetric, setAgreementMetric] = useState("");
  const [agreementValue, setAgreementValue] = useState("");
  const [adjudicationNotes, setAdjudicationNotes] = useState("");
  const [reliabilityLimitations, setReliabilityLimitations] = useState("");
  const [demoManualReviews, setDemoManualReviews] = useState<DemoManualReviewState>({});
  const [layers, setLayers] = useState<LayerVisibility>({ social: true, concept: true, bridge: true });
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [pendingActiveWindow, setPendingActiveWindow] = useState<SenaTemporalWindow | null>(null);
  const [evidenceSourceFilter, setEvidenceSourceFilter] = useState<EvidenceSourceFilter>("all");
  const [workspaceRailMode, setWorkspaceRailMode] = useState<WorkspaceRailMode>("plots");
  const [activePlotView, setActivePlotView] = useState<SenaPlotView>("fusion");
  const [isPlotSwitcherOpen, setIsPlotSwitcherOpen] = useState(false);
  const [isPlotToolsAdvancedOpen, setIsPlotToolsAdvancedOpen] = useState(false);
  const [isWorkspaceDataViewOpen, setIsWorkspaceDataViewOpen] = useState(false);
  const [isFusionPlotMaximized, setIsFusionPlotMaximized] = useState(false);
  const [fusionPlotZoom, setFusionPlotZoom] = useState(1);
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContext | null>(null);
  const [enterpriseProjects, setEnterpriseProjects] = useState<EnterpriseProjectSummary[]>([]);
  const [enterpriseTeamState, setEnterpriseTeamState] = useState<EnterpriseTeamState | null>(null);
  const [enterpriseUploadStorage, setEnterpriseUploadStorage] = useState<EnterpriseUploadStorageState | null>(null);
  const [enterpriseMfaStatus, setEnterpriseMfaStatus] = useState<EnterpriseMfaStatus | null>(null);
  const [enterpriseMfaSetup, setEnterpriseMfaSetup] = useState<EnterpriseMfaSetup | null>(null);
  const [enterpriseSessionList, setEnterpriseSessionList] = useState<EnterpriseSessionList | null>(null);
  const [enterpriseSsoPreflight, setEnterpriseSsoPreflight] = useState<EnterpriseSsoPreflight | null>(null);
  const [enterpriseDeploymentPackage, setEnterpriseDeploymentPackage] = useState<EnterpriseOrganizationDeploymentPackage | null>(null);
  const [enterpriseIdentityProductionEvidence, setEnterpriseIdentityProductionEvidence] = useState<EnterpriseIdentityProductionEvidenceDossier | null>(null);
  const [enterpriseImportRuns, setEnterpriseImportRuns] = useState<EnterpriseImportRun[]>([]);
  const [localEnterpriseImportResult, setLocalEnterpriseImportResult] = useState<SenaEnterpriseImportResult | null>(null);
  const [localEnterpriseReliabilityResult, setLocalEnterpriseReliabilityResult] = useState<SenaLocalReliabilityImportResult | null>(null);
  const [localEnterpriseValidationResult, setLocalEnterpriseValidationResult] = useState<LocalEnterpriseValidationResult | null>(null);
  const [enterpriseAnalysisRuns, setEnterpriseAnalysisRuns] = useState<EnterpriseAnalysisRun[]>([]);
  const [activeEnterpriseProjectId, setActiveEnterpriseProjectId] = useState("");
  const [enterpriseMessage, setEnterpriseMessage] = useState("Sign in to enable server-side projects, RBAC, Excel imports, reliability workflows, and publication exports.");
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [enterpriseCollaboration, setEnterpriseCollaboration] = useState<EnterpriseCollaborationState | null>(null);
  const [enterpriseClaimPackage, setEnterpriseClaimPackage] = useState<EnterpriseClaimEvidencePackage | null>(null);
  const [enterprisePlatformDecisionState, setEnterprisePlatformDecisionState] = useState<EnterprisePlatformDecisionState | null>(null);
  const [enterpriseReleaseGateState, setEnterpriseReleaseGateState] = useState<EnterpriseReleaseGateState | null>(null);
  const [enterpriseCollaborationTransport, setEnterpriseCollaborationTransport] = useState<"manual" | "streaming" | "reconnecting">("manual");
  const enterpriseCsrfRef = useRef<EnterpriseCsrfToken | null>(null);
  const [teamInviteEmail, setTeamInviteEmail] = useState("");
  const [teamInviteRole, setTeamInviteRole] = useState<EnterpriseRole>("reviewer");
  const [teamInviteCode, setTeamInviteCode] = useState("");
  const [enterpriseMfaEnableCode, setEnterpriseMfaEnableCode] = useState("");
  const [enterpriseMfaDisableCode, setEnterpriseMfaDisableCode] = useState("");
  const [enterpriseComment, setEnterpriseComment] = useState("");
  const [adjudicationItemId, setAdjudicationItemId] = useState("");
  const [adjudicationCodeId, setAdjudicationCodeId] = useState("");
  const [adjudicationDecision, setAdjudicationDecision] = useState<"include" | "exclude" | "revise">("include");
  const [adjudicationNotesQuick, setAdjudicationNotesQuick] = useState("");
  const [reliabilityReviewNote, setReliabilityReviewNote] = useState("");
  const [validationGroupField, setValidationGroupField] = useState<"group" | "role">("group");
  const [validationGroupA, setValidationGroupA] = useState("");
  const [validationGroupB, setValidationGroupB] = useState("");
  const [validationMetric, setValidationMetric] = useState<SenaGroupComparisonMetric>("bridgeScore");
  const [validationPreregistrationNote, setValidationPreregistrationNote] = useState("");
  const [validationMethodNote, setValidationMethodNote] = useState("");
  const [validationStudySpecificInferenceReference, setValidationStudySpecificInferenceReference] = useState("");
  const [validationReviewNote, setValidationReviewNote] = useState("");
  const [expertReviewerName, setExpertReviewerName] = useState("");
  const [expertExpertiseArea, setExpertExpertiseArea] = useState("");
  const [expertClaimScope, setExpertClaimScope] = useState<"exploratory-only" | "claim-ready-with-limits" | "not-claim-ready">("exploratory-only");
  const [expertDataAdequacy, setExpertDataAdequacy] = useState(3);
  const [expertMethodFit, setExpertMethodFit] = useState(3);
  const [expertInterpretationValidity, setExpertInterpretationValidity] = useState(3);
  const [expertConcerns, setExpertConcerns] = useState("");
  const [expertRecommendations, setExpertRecommendations] = useState("");
  const [platformDecisionId, setPlatformDecisionId] = useState<EnterprisePlatformDecisionId>("native-managed-database");
  const [platformDecisionStatus, setPlatformDecisionStatus] = useState<EnterprisePlatformDecisionStatus>("accepted");
  const [platformDecisionAcceptBridge, setPlatformDecisionAcceptBridge] = useState(true);
  const [platformDecisionOwnerName, setPlatformDecisionOwnerName] = useState("");
  const [platformDecisionOwnerRole, setPlatformDecisionOwnerRole] = useState("Platform operations");
  const [platformDecisionEnvironment, setPlatformDecisionEnvironment] = useState("pilot-production");
  const [platformDecisionEvidenceUrl, setPlatformDecisionEvidenceUrl] = useState("");
  const [platformDecisionProductionEvidenceIds, setPlatformDecisionProductionEvidenceIds] = useState<string[]>([]);
  const [platformDecisionProductionEvidenceVerifiedAt, setPlatformDecisionProductionEvidenceVerifiedAt] = useState("");
  const [platformDecisionNotes, setPlatformDecisionNotes] = useState("");
  const [releaseGateDecision, setReleaseGateDecision] = useState<EnterpriseReleaseGateDecision>("conditional");
  const [releaseGateApproverName, setReleaseGateApproverName] = useState("");
  const [releaseGateApproverRole, setReleaseGateApproverRole] = useState("Research platform lead");
  const [releaseGateEnvironment, setReleaseGateEnvironment] = useState("pilot-production");
  const [releaseGateVersion, setReleaseGateVersion] = useState("2026.06.13-local-pilot");
  const [releaseGateNotes, setReleaseGateNotes] = useState("");
  const [releaseGateVerificationStatus, setReleaseGateVerificationStatus] = useState<EnterpriseReleaseVerificationStatus>("passed");
  const [releaseGateVerificationSummary, setReleaseGateVerificationSummary] = useState("sena:pilot:verify passed with production build, visual guards, and browser interaction smoke.");
  const [releaseGateVerificationHash, setReleaseGateVerificationHash] = useState("");

  const buildOptions = useMemo(() => ({
    alpha,
    beta,
    gamma,
    normalization,
    temporal: {
      mode: temporalMode,
      movingWindowSize,
      movingWindowStep,
      turnWindowRadius
    }
  }), [alpha, beta, gamma, movingWindowSize, movingWindowStep, normalization, temporalMode, turnWindowRadius]);
  const codingReliabilityReview = useMemo<Partial<SenaCodingReliabilityReview>>(() => ({
    status: codingReliabilityStatus,
    reviewer: codingReliabilityReviewer,
    codingScheme,
    unitOfCoding,
    coderCount,
    agreementMetric,
    agreementValue,
    adjudicationNotes,
    limitations: reliabilityLimitations
  }), [adjudicationNotes, agreementMetric, agreementValue, coderCount, codingReliabilityReviewer, codingReliabilityStatus, codingScheme, reliabilityLimitations, unitOfCoding]);
  const dataGovernanceReview = useMemo<Partial<SenaDataGovernanceMetadata>>(() => ({
    irbApprovalId: dataGovernanceIrbApprovalId,
    consentScope: dataGovernanceConsentScope,
    retentionPolicy: dataGovernanceRetentionPolicy,
    usageConstraints: dataGovernanceUsageConstraints
      .split(/\n|;/)
      .map((item) => item.trim())
      .filter(Boolean),
    dataSteward: dataGovernanceDataSteward
  }), [
    dataGovernanceConsentScope,
    dataGovernanceDataSteward,
    dataGovernanceIrbApprovalId,
    dataGovernanceRetentionPolicy,
    dataGovernanceUsageConstraints
  ]);
  const timelineModel = useMemo(() => buildSenaModel(dataset, buildOptions), [buildOptions, dataset]);
  const sourceDataContractAudit = useMemo(() => buildSenaDataContractAudit(dataset, { modelWarnings: timelineModel.summary.warnings }), [dataset, timelineModel.summary.warnings]);
  const temporalRuntimeTrace = useMemo(() => buildSenaTemporalRuntimeTrace(dataset, buildOptions, { timelineModel }), [buildOptions, dataset, timelineModel]);
  const temporalWindows = timelineModel.temporal.windows;
  const activeTemporalIndex = Math.min(activeWindowIndex, Math.max(0, temporalWindows.length - 1));
  const activeTemporalWindow = temporalWindows[activeTemporalIndex];
  const analysisDataset = useMemo(() => {
    return activeTemporalWindow ? scopeSenaDatasetToWindow(dataset, activeTemporalWindow) : dataset;
  }, [activeTemporalWindow, dataset]);
  const model = useMemo(() => buildSenaModel(analysisDataset, buildOptions), [analysisDataset, buildOptions]);
  const enaManifest = useMemo(() => buildSenaEnaManifest(model.dataset), [model.dataset]);
  const snaManifest = useMemo(() => buildSenaSnaManifest(model), [model]);
  const dataContractAudit = useMemo(() => buildSenaDataContractAudit(model.dataset, { modelWarnings: model.summary.warnings }), [model.dataset, model.summary.warnings]);
  const jenaConceptPairHandoffRows = useMemo(() => buildSenaJenaConceptPairHandoffRows(model, enaManifest), [enaManifest, model]);
  const jsnaSocialTieHandoffRows = useMemo(() => buildSenaJsnaSocialTieHandoffRows(model, snaManifest), [model, snaManifest]);
  const runtimeConsistencyAudit = useMemo(() => buildSenaRuntimeConsistencyAudit({ model, enaManifest, snaManifest }), [enaManifest, model, snaManifest]);
  const fusionMathAudit = useMemo(() => buildSenaFusionMathAudit(model), [model]);
  const methodValidation = useMemo(() => buildSenaValidation(model), [model]);
  const methodProtocol = useMemo(() => buildSenaMethodProtocol(model, {
    title: `${reportTitle} Method Protocol`,
    generatedAt: "preview",
    activeTemporalWindow: activeTemporalWindow ?? null
  }), [activeTemporalWindow, model, reportTitle]);
  const codingReliabilityGate = useMemo(() => buildSenaCodingReliabilityGate({
    generatedAt: "preview",
    codingReliability: codingReliabilityReview
  }, "preview"), [codingReliabilityReview]);
  const evidenceLedger = useMemo(() => buildSenaEvidenceLedger(model, {
    title: reportTitle,
    activeTemporalWindow: activeTemporalWindow ?? null,
    evidenceLimit: 80,
    humanReview: {
      status: reviewStatus,
      reviewer,
      interpretation,
      limitations,
      nextActions
    }
  }), [activeTemporalWindow, interpretation, limitations, model, nextActions, reportTitle, reviewStatus, reviewer]);
  const activeWindowBrief = useMemo(() => buildSenaActiveWindowBrief(model, {
    activeTemporalWindow: activeTemporalWindow ?? null,
    sourceDataset: dataset,
    evidenceSnippets: evidenceLedger.snippets,
    humanReview: {
      status: reviewStatus,
      reviewer,
      reviewedAt: "preview",
      interpretation,
      limitations,
      nextActions
    },
    codingReliabilityGate
  }), [activeTemporalWindow, codingReliabilityGate, dataset, evidenceLedger.snippets, interpretation, limitations, model, nextActions, reviewStatus, reviewer]);
  const reportCompletenessAudit = useMemo(() => buildSenaReportCompletenessAudit({
    model,
    enaManifest,
    snaManifest,
    runtimeConsistencyAudit,
    dataContractAudit,
    fusionMathAudit,
    evidenceSnippets: evidenceLedger.snippets,
    humanReview: {
      status: reviewStatus,
      reviewer,
      reviewedAt: "preview",
      interpretation,
      limitations,
      nextActions
    },
    codingReliabilityGate,
    dataGovernance: dataGovernanceReview
  }), [codingReliabilityGate, dataContractAudit, dataGovernanceReview, enaManifest, evidenceLedger.snippets, fusionMathAudit, interpretation, limitations, model, nextActions, reviewStatus, reviewer, runtimeConsistencyAudit, snaManifest]);
  const pilotReadinessAudit = useMemo(() => buildSenaPilotReadinessAudit({
    model,
    completenessAudit: reportCompletenessAudit,
    dataContractAudit,
    runtimeConsistencyAudit,
    fusionMathAudit,
    validation: methodValidation,
    evidenceLedger,
    humanReview: {
      status: reviewStatus,
      reviewer,
      reviewedAt: "preview",
      interpretation,
      limitations,
      nextActions
    },
    codingReliabilityGate,
    dataGovernance: dataGovernanceReview
  }), [codingReliabilityGate, dataContractAudit, dataGovernanceReview, evidenceLedger, fusionMathAudit, interpretation, limitations, methodValidation, model, nextActions, reportCompletenessAudit, reviewStatus, reviewer, runtimeConsistencyAudit]);
  const claimReadinessGate = useMemo(() => buildSenaClaimReadinessGate(pilotReadinessAudit), [pilotReadinessAudit]);
  const demoWalkthroughPreview = useMemo(() => buildSenaDemoWalkthrough(model, {
    title: `${reportTitle} Demo Walkthrough`,
    generatedAt: "preview",
    activeTemporalWindow: activeTemporalWindow ?? null,
    pilotReadinessAudit,
    temporalRuntimeTrace
  }), [activeTemporalWindow, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);
  const demoVerificationPreview = useMemo(() => buildSenaDemoVerification(model, {
    title: `${reportTitle} Demo Verification`,
    generatedAt: "preview",
    activeTemporalWindow: activeTemporalWindow ?? null,
    pilotReadinessAudit,
    temporalRuntimeTrace,
    manualReviews: demoManualReviews
  }), [activeTemporalWindow, demoManualReviews, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);
  const demoVerificationCompatibilityAuditPreview = useMemo(
    () => buildSenaDemoVerificationCompatibilityAudit(model, demoVerificationPreview),
    [demoVerificationPreview, model]
  );
  const developmentPlan = useMemo(() => buildSenaDevelopmentPlan(model, {
    title: `${reportTitle} Development Plan`,
    generatedAt: "preview",
    activeTemporalWindow: activeTemporalWindow ?? null,
    pilotReadinessAudit,
    demoWalkthrough: demoWalkthroughPreview,
    demoVerification: demoVerificationPreview
  }), [activeTemporalWindow, demoVerificationPreview, demoWalkthroughPreview, model, pilotReadinessAudit, reportTitle]);
  const reviewPacketAudit = useMemo(() => buildSenaReviewPacket(model, {
    title: reportTitle,
    generatedAt: "preview",
    activeTemporalWindow: activeTemporalWindow ?? null,
    sourceDataset: dataset,
    temporalRuntimeTrace,
    evidenceLimit: 80,
    demoVerificationManualReviews: demoManualReviews,
    humanReview: {
      status: reviewStatus,
      reviewer,
      reviewedAt: "preview",
      interpretation,
      limitations,
      nextActions
    },
    codingReliability: codingReliabilityReview,
    dataGovernance: dataGovernanceReview
  }).reviewPacketAudit, [activeTemporalWindow, codingReliabilityReview, dataGovernanceReview, dataset, demoManualReviews, interpretation, limitations, model, nextActions, reportTitle, reviewStatus, reviewer, temporalRuntimeTrace]);
  const workflowStepStates = useMemo<WorkflowStepState[]>(() => {
    const readiness = new Map(pilotReadinessAudit.items.map((item) => [item.id, item.status]));
    const isReady = (...ids: string[]) => ids.every((id) => readiness.get(id) === "ready");
    const temporalReady = temporalWindows.length > 0 && temporalRuntimeTrace.windows.length > 0;

    const statusByStepId: Record<string, WorkflowStatus> = {
      "workflow-data": sourceDataContractAudit.status === "valid" ? "ready" : "review",
      "workflow-model": isReady("fusion-model", "fusion-math") ? "ready" : "review",
      "workflow-canvas": readiness.get("fusion-model") === "ready" ? "ready" : "review",
      "workflow-evidence": readiness.get("evidence-ledger") === "ready" ? "ready" : "review",
      "workflow-temporal": temporalReady ? "ready" : "review",
      "workflow-report": isReady("report-completeness", "coding-reliability", "data-governance", "human-review") ? "ready" : "review"
    };

    return workflowSteps.map((step) => {
      const status = statusByStepId[step.id] ?? "review";
      return {
        ...step,
        status,
        statusLabel: status === "ready" ? "Ready" : "Review"
      };
    });
  }, [pilotReadinessAudit.items, sourceDataContractAudit.status, temporalRuntimeTrace.windows.length, temporalWindows.length]);
  const defaultSelection = model.summary.strongestBridgeTie?.id ?? model.nodes[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(defaultSelection);
  const selected = model.edges.find((edge) => edge.id === selectedId) ?? model.nodes.find((node) => node.id === selectedId) ?? model.edges.find((edge) => edge.id === defaultSelection) ?? model.nodes[0];
  const graphNodeIds = useMemo(() => new Set(model.nodes.map((node) => node.id)), [model.nodes]);
  const [revealedNodeLabelIds, setRevealedNodeLabelIds] = useState<string[]>([]);
  useEffect(() => {
    setRevealedNodeLabelIds((current) => {
      const next = current.filter((id) => graphNodeIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [graphNodeIds]);
  function handleCanvasSelect(id: string) {
    setSelectedId(id);
    if (!graphNodeIds.has(id)) return;
    setRevealedNodeLabelIds((current) => current.includes(id) ? current : [...current, id]);
  }
  const visibleFusionEdges = useMemo(
    () => model.edges.filter((edge) => layers[edge.layer] && edge.normalizedWeight >= threshold),
    [layers, model.edges, threshold]
  );
  const visibleConceptPairContributions = useMemo(() => buildConceptPairContributionMap(model), [model]);
  const visibleEdgeStrokeScale = useMemo(
    () => buildEdgeStrokeScale(visibleFusionEdges, visibleConceptPairContributions),
    [visibleConceptPairContributions, visibleFusionEdges]
  );
  const selectedLayout = layoutOptions.find((item) => item.value === layout) ?? layoutOptions[0];
  const activeWindowLabel = activeTemporalWindow ? activeTemporalWindow.label : "Full conversation";
  const activeTurnLabel = activeTemporalWindow ? `${activeTemporalWindow.startTurn}-${activeTemporalWindow.endTurn}` : "All";
  const activeTemporalTransition = activeTemporalWindow
    ? temporalRuntimeTrace.transitions.find((transition) => transition.toWindowId === activeTemporalWindow.id) ??
      temporalRuntimeTrace.transitions.find((transition) => transition.fromWindowId === activeTemporalWindow.id)
    : undefined;
  const edgeEvidenceCount = model.edges.reduce((total, edge) => total + edge.evidence.length, 0);
  const pairEvidenceCount = model.pairReport.reduce((total, pair) => total + pair.evidence.length, 0);
  const temporalEvidenceCount = model.temporal.windows.reduce((total, window) => total + window.evidence.length, 0);
  const totalEvidenceRefs = edgeEvidenceCount + pairEvidenceCount + temporalEvidenceCount;
  const reportReadyPercent = Math.round((reportCompletenessAudit.passed / Math.max(1, reportCompletenessAudit.items.length)) * 100);
  const activeRailPanel = workspaceRailPanelCopy[workspaceRailMode];
  const topActors = [...model.socialReport.actors]
    .sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 4);
  const topPairs = [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))
    .slice(0, 4);
  const enterpriseUserId = enterpriseContext?.user?.id ?? "";
  const activeEnterpriseTeamId = enterpriseContext?.teams[0]?.id ?? "";
  const latestEnterpriseImportRun = enterpriseImportRuns[0] ?? null;
  const latestImportCleaningManifest = latestEnterpriseImportRun?.cleaningManifest ?? localEnterpriseImportResult?.cleaningManifest ?? null;
  const latestEnterpriseAnalysisRun = enterpriseAnalysisRuns[0] ?? null;
  const latestEnterpriseReliabilityRun = enterpriseCollaboration?.reliabilityRuns[0] ?? null;
  const latestReliabilityDashboard = latestEnterpriseReliabilityRun?.dashboard ?? localEnterpriseReliabilityResult?.dashboard ?? null;
  const latestEnterpriseValidationRun = enterpriseCollaboration?.validationRuns[0] ?? null;
  const latestValidationResult = latestEnterpriseValidationRun?.result ?? localEnterpriseValidationResult?.result ?? null;
  const latestValidationPreregistrationPlan = latestEnterpriseValidationRun?.preregistrationPlan ?? localEnterpriseValidationResult?.preregistrationPlan ?? null;
  const latestEnterpriseExpertReview = enterpriseCollaboration?.expertReviews[0] ?? null;
  const latestPlatformDecisionAcceptance = enterprisePlatformDecisionState?.acceptances[0] ?? null;
  const selectedPlatformDecision = enterprisePlatformDecisionState?.platformDecisionRegister?.decisions.find((decision) => decision.id === platformDecisionId) ?? null;
  const selectedPlatformDecisionProductionEvidenceItems = selectedPlatformDecision?.evidenceChecklist
    .filter((item) => item.productionRequired && item.source === "platform-acceptance") ?? [];
  const platformDecisionRequiresIdentityEvidenceUrl = platformDecisionStatus === "accepted" &&
    platformDecisionProductionEvidenceIds.some((evidenceId) => platformDecisionTimestampedEvidenceIds.has(evidenceId));
  const platformDecisionRequiresIdentityEvidenceTimestamp = platformDecisionStatus === "accepted" &&
    platformDecisionProductionEvidenceIds.some((evidenceId) => platformDecisionTimestampedEvidenceIds.has(evidenceId));
  const latestReleaseGateReview = enterpriseReleaseGateState?.reviews[0] ?? null;
  const latestReleaseGateIdentitySnapshot = latestReleaseGateReview?.identityProductionSnapshot;
  const enterpriseTeamUsersById = useMemo(() => new Map((enterpriseTeamState?.users ?? []).map((user) => [user.id, user])), [enterpriseTeamState?.users]);
  const enterpriseRoleOptions: EnterpriseRole[] = ["pi", "admin", "coder", "reviewer", "viewer"];
  const enterpriseTeamMemberships = useMemo(() => (
    (enterpriseTeamState?.memberships ?? []).filter((membership) => !activeEnterpriseTeamId || membership.teamId === activeEnterpriseTeamId)
  ), [activeEnterpriseTeamId, enterpriseTeamState?.memberships]);
  const pendingEnterpriseInvitations = useMemo(() => (
    (enterpriseTeamState?.invitations ?? []).filter((invitation) => invitation.status === "pending" && (!activeEnterpriseTeamId || invitation.teamId === activeEnterpriseTeamId))
  ), [activeEnterpriseTeamId, enterpriseTeamState?.invitations]);
  const enterpriseNotifications = useMemo(() => (
    enterpriseTeamState?.notifications ?? []
  ), [enterpriseTeamState?.notifications]);
  const unreadEnterpriseNotificationCount = enterpriseNotifications.filter((notification) => notification.status !== "read").length;
  const enterpriseUploads = enterpriseUploadStorage?.uploads ?? [];
  const latestEnterpriseUpload = enterpriseUploads[0] ?? null;
  const enterpriseUploadVerification = enterpriseUploadStorage?.storageVerification ?? null;
  const provisioningDeploymentEnv = enterpriseDeploymentPackage?.env.filter((entry) => entry.category === "provisioning" || entry.category === "identity") ?? [];
  const provisioningServiceEndpoints = enterpriseDeploymentPackage?.serviceEndpoints.filter((endpoint) => endpoint.id === "provisioning" || endpoint.id.startsWith("scim-")) ?? [];
  const identityProductionServiceEndpoint = enterpriseDeploymentPackage?.serviceEndpoints.find((endpoint) => endpoint.id === "ops-identity-production-evidence") ?? null;
  const provisioningOwnerDecision = enterpriseDeploymentPackage?.platformDecisions.find((decision) => decision.id === "institution-provisioning-owner") ?? null;
  const provisioningGovernanceCheck = enterpriseDeploymentPackage?.governance.keyChecks.find((check) => check.id === "organization-provisioning") ?? null;
  const identityProductionHandoff = enterpriseDeploymentPackage?.identityProductionHandoff ?? null;
  const identityProductionRequestPacket = enterpriseIdentityProductionEvidence?.platformRequestPacket ?? identityProductionHandoff?.platformRequestPacket ?? null;
  const identityCutoverChecklist = enterpriseIdentityProductionEvidence?.cutoverChecklist ?? identityProductionHandoff?.cutoverChecklist ?? null;
  const identityInstitutionActionPlan = enterpriseIdentityProductionEvidence?.institutionActionPlan ?? identityProductionHandoff?.institutionActionPlan ?? null;
  const institutionActionPlan = identityInstitutionActionPlan;
  const platformRequestPacket = identityProductionRequestPacket;
  const platformRequestPacketPolicyHash = platformRequestPacket?.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyHash="))
    ?.slice("requestPacketPolicyHash=".length);
  const validationGroupValues = useMemo(() => (
    Array.from(new Set(dataset.people.map((person) => person[validationGroupField]).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [dataset.people, validationGroupField]);
  const selectedValidationGroupA = validationGroupA || validationGroupValues[0] || "";
  const selectedValidationGroupB = validationGroupB || validationGroupValues.find((value) => value !== selectedValidationGroupA) || "";

  function buildCurrentProjectSnapshot(generatedAt = new Date().toISOString()) {
    return buildSenaProjectSnapshot(model, {
      title: reportTitle,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      sourceDataset: dataset,
      temporalRuntimeTrace,
      demoVerificationManualReviews: demoManualReviews,
      humanReview: {
        status: reviewStatus,
        reviewer,
        reviewedAt: generatedAt,
        interpretation,
        limitations,
        nextActions
      },
      codingReliability: {
        ...codingReliabilityReview,
        reviewedAt: generatedAt
      },
      dataGovernance: dataGovernanceReview
    });
  }

  const enterpriseCsrfHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!enterpriseCsrfRef.current) {
      const response = await fetch("/api/auth/csrf");
      const payload = await response.json();
      if (!response.ok || !payload.token) throw new Error(payload.error || "Could not prepare secure request token.");
      enterpriseCsrfRef.current = {
        headerName: String(payload.headerName || "x-sena-csrf-token"),
        token: String(payload.token),
        sessionId: String(payload.sessionId || ""),
        expiresAt: String(payload.expiresAt || "")
      };
    }
    return { [enterpriseCsrfRef.current.headerName]: enterpriseCsrfRef.current.token };
  }, []);

  const enterpriseJsonHeaders = useCallback(async () => {
    return {
      "content-type": "application/json",
      ...(await enterpriseCsrfHeaders())
    };
  }, [enterpriseCsrfHeaders]);

  const refreshEnterpriseTeamState = useCallback(async () => {
    const response = await fetch("/api/sena/team");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load team state.");
    setEnterpriseTeamState(payload as EnterpriseTeamState);
    return payload as EnterpriseTeamState;
  }, []);

  const refreshEnterpriseMfaState = useCallback(async () => {
    const response = await fetch("/api/auth/mfa");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load MFA status.");
    setEnterpriseMfaStatus(payload as EnterpriseMfaStatus);
    return payload as EnterpriseMfaStatus;
  }, []);

  const refreshEnterpriseSessionList = useCallback(async () => {
    const response = await fetch("/api/auth/sessions");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load sessions.");
    setEnterpriseSessionList(payload as EnterpriseSessionList);
    return payload as EnterpriseSessionList;
  }, []);

  const refreshEnterprisePlatformDecisionState = useCallback(async (teamId = activeEnterpriseTeamId) => {
    if (!teamId) {
      setEnterprisePlatformDecisionState(null);
      return null;
    }
    const response = await fetch(`/api/sena/ops/platform-decisions?teamId=${encodeURIComponent(teamId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load platform decisions.");
    setEnterprisePlatformDecisionState(payload as EnterprisePlatformDecisionState);
    return payload as EnterprisePlatformDecisionState;
  }, [activeEnterpriseTeamId]);

  const refreshEnterpriseReleaseGateReviews = useCallback(async (teamId = activeEnterpriseTeamId) => {
    if (!teamId) {
      setEnterpriseReleaseGateState(null);
      return null;
    }
    const response = await fetch(`/api/sena/ops/release-gate?teamId=${encodeURIComponent(teamId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load release gate reviews.");
    setEnterpriseReleaseGateState(payload as EnterpriseReleaseGateState);
    return payload as EnterpriseReleaseGateState;
  }, [activeEnterpriseTeamId]);

  async function runEnterpriseSsoPreflightFromWorkspace(provider?: EnterpriseSsoProvider) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before running enterprise SSO preflight.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const preflightUrl = "/api/auth/sso?status=1&preflight=1";
      const response = await fetch(provider ? `${preflightUrl}&provider=${encodeURIComponent(provider)}` : preflightUrl);
      const payload = await response.json() as EnterpriseSsoProviderStatusResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Enterprise SSO preflight failed.");
      if (!payload.preflight || payload.preflight.schemaVersion !== "sena-enterprise-sso-preflight/v1") {
        throw new Error("Enterprise SSO preflight response did not include readiness evidence.");
      }
      setEnterpriseSsoPreflight(payload.preflight);
      setEnterpriseMessage(`SSO preflight checked ${payload.preflight.summary.checked} provider${payload.preflight.summary.checked === 1 ? "" : "s"}: ${payload.preflight.summary.passed} passed, ${payload.preflight.summary.review} for review.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise SSO preflight failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function logoutEnterpriseSessionFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("No active enterprise session is signed in.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: await enterpriseJsonHeaders()
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise logout failed.");
      enterpriseCsrfRef.current = null;
      setEnterpriseContext(null);
      setEnterpriseProjects([]);
      setEnterpriseTeamState(null);
      setEnterpriseUploadStorage(null);
      setEnterpriseMfaStatus(null);
      setEnterpriseMfaSetup(null);
      setEnterpriseSessionList(null);
      setEnterpriseSsoPreflight(null);
      setEnterpriseDeploymentPackage(null);
      setEnterpriseIdentityProductionEvidence(null);
      setEnterpriseImportRuns([]);
      setEnterpriseAnalysisRuns([]);
      setActiveEnterpriseProjectId("");
      setEnterpriseCollaboration(null);
      setEnterpriseClaimPackage(null);
      setEnterprisePlatformDecisionState(null);
      setEnterpriseReleaseGateState(null);
      setEnterpriseMessage("Signed out of the SENA enterprise runtime.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise logout failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function revokeEnterpriseSession(sessionId?: string, action?: "revoke-others") {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before managing sessions.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify(action ? { action } : { sessionId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Session revoke failed.");
      setEnterpriseSessionList({
        schemaVersion: "sena-enterprise-session-list/v1",
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        currentSessionId: enterpriseSessionList?.currentSessionId ?? "",
        sessionDays: enterpriseSessionList?.sessionDays ?? 0,
        sessionPolicy: enterpriseSessionList?.sessionPolicy,
        sessions: payload.remainingSessions ?? []
      });
      setEnterpriseMessage(`Revoked ${payload.revokedCount ?? 0} session${payload.revokedCount === 1 ? "" : "s"}.`);
      await refreshEnterpriseSessionList();
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Session revoke failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function startEnterpriseMfaSetup() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before setting up authenticator MFA.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ action: "setup" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "MFA setup failed.");
      setEnterpriseMfaSetup(payload as EnterpriseMfaSetup);
      setEnterpriseMfaEnableCode("");
      setEnterpriseMessage(`Authenticator setup started. Enter the 6-digit code before ${new Date(payload.expiresAt).toLocaleTimeString()}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA setup failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function enableEnterpriseMfaFromSetup() {
    const code = enterpriseMfaEnableCode.trim();
    if (!enterpriseMfaSetup || !code) {
      setEnterpriseMessage("Start MFA setup and enter the authenticator code before enabling.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "enable",
          setupToken: enterpriseMfaSetup.setupToken,
          code
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "MFA enable failed.");
      setEnterpriseMfaStatus(payload as EnterpriseMfaStatus);
      setEnterpriseMfaSetup(null);
      setEnterpriseMfaEnableCode("");
      setEnterpriseMessage("Authenticator MFA enabled for this SENA account.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA enable failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function disableEnterpriseMfaFromCode() {
    const code = enterpriseMfaDisableCode.trim();
    if (!code) {
      setEnterpriseMessage("Enter your current authenticator code before disabling MFA.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "DELETE",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ code })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "MFA disable failed.");
      setEnterpriseMfaStatus(payload as EnterpriseMfaStatus);
      setEnterpriseMfaSetup(null);
      setEnterpriseMfaDisableCode("");
      setEnterpriseMessage("Authenticator MFA disabled for this SENA account.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA disable failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function createTeamInvitation() {
    const email = teamInviteEmail.trim();
    if (!activeEnterpriseTeamId || !email) {
      setEnterpriseMessage("Choose a team and enter an email before creating an invitation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/team/invitations", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          email,
          role: teamInviteRole
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invitation failed.");
      setTeamInviteEmail("");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Invitation queued for ${payload.invitation?.email ?? email} as ${payload.invitation?.role ?? teamInviteRole}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function acceptTeamInvitation() {
    const inviteCode = teamInviteCode.trim();
    if (!inviteCode) {
      setEnterpriseMessage("Paste an invitation code before accepting an invitation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/team/invitations", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ inviteCode })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invitation acceptance failed.");
      setTeamInviteCode("");
      if (payload.context) setEnterpriseContext(payload.context as EnterpriseContext);
      await refreshEnterpriseState();
      setEnterpriseMessage(`Invitation accepted for ${payload.context?.teams?.[0]?.name ?? "SENA team"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation acceptance failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function revokeTeamInvitation(invitationId: string) {
    if (!invitationId) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/team/invitations", {
        method: "DELETE",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ invitationId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invitation revoke failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Invitation revoked for ${payload.invitation?.email ?? invitationId}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation revoke failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function updateTeamMembership(membershipId: string, input: { role?: EnterpriseRole; status?: "active" | "suspended" }) {
    if (!membershipId) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/team/memberships", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ membershipId, ...input })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Membership update failed.");
      await refreshEnterpriseTeamState();
      await refreshEnterpriseState();
      setEnterpriseMessage(`Membership ${payload.membership?.id ?? membershipId} updated: ${payload.membership?.role ?? input.role ?? "role"} · ${payload.membership?.status ?? input.status ?? "status"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Membership update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function markEnterpriseNotificationReadFromWorkspace(notificationId: string) {
    if (!notificationId) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/notifications", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ notificationId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Notification update failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Notification ${payload.notification?.id ?? notificationId} marked read.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Notification update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseNotifications() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before running notification delivery.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/notifications", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ action: "deliver", teamId: activeEnterpriseTeamId || undefined, force: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Notification delivery failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Notification webhook delivery checked ${payload.notifications?.length ?? 0} item${payload.notifications?.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Notification delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseEmailsFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before running email delivery.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/notifications", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ action: "deliver-email", teamId: activeEnterpriseTeamId || undefined, force: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Email delivery failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Institution email delivery checked ${payload.deliveries?.length ?? payload.emailDeliveries?.length ?? 0} item${(payload.deliveries?.length ?? payload.emailDeliveries?.length) === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Email delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function refreshEnterpriseUploadStorage(options: { verify?: boolean } = { verify: true }) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before loading enterprise upload storage.");
      return null;
    }
    const query = new URLSearchParams();
    if (activeEnterpriseTeamId) query.set("teamId", activeEnterpriseTeamId);
    if (options.verify) query.set("verify", "1");
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/uploads${query.toString() ? `?${query.toString()}` : ""}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Upload storage refresh failed.");
      setEnterpriseUploadStorage(payload as EnterpriseUploadStorageState);
      const verification = payload.storageVerification as EnterpriseUploadStorageVerification | undefined;
      setEnterpriseMessage(verification
        ? `Upload storage ${verification.status}: ${verification.summary.verifiedBlobs}/${verification.summary.registeredUploads} blobs verified.`
        : `Upload registry loaded ${payload.uploads?.length ?? 0} upload${payload.uploads?.length === 1 ? "" : "s"}.`);
      return payload as EnterpriseUploadStorageState;
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Upload storage refresh failed.");
      return null;
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function createEnterpriseUploadRegistryFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with an active team before creating enterprise uploads.");
      return;
    }
    if (files.length === 0) return;
    setEnterpriseBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.append("teamId", activeEnterpriseTeamId);
      const response = await fetch("/api/sena/uploads", {
        method: "POST",
        headers: await enterpriseCsrfHeaders(),
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise upload failed.");
      setEnterpriseUploadStorage(payload as EnterpriseUploadStorageState);
      await refreshEnterpriseUploadStorage({ verify: true });
      setEnterpriseMessage(`Enterprise upload registry created ${payload.uploads?.length ?? files.length} file${files.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise upload failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseUploadObjectStorage(uploadId?: string) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before delivering enterprise uploads to object storage.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/uploads", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "deliver-object-storage",
          teamId: activeEnterpriseTeamId || undefined,
          uploadId,
          limit: uploadId ? 1 : 25,
          includeReview: true
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Object-storage delivery failed.");
      await refreshEnterpriseUploadStorage({ verify: true });
      setEnterpriseMessage(`Object-storage delivery ${payload.status ?? "checked"}: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Object-storage delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseCollaborationPubSubFromWorkspace(projectId = activeEnterpriseProjectId) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before delivering collaboration pub/sub events.");
      return;
    }
    if (!projectId) {
      setEnterpriseMessage("Save or select a server project before delivering collaboration pub/sub events.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/projects/${projectId}/collaboration`, {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "deliver-pubsub",
          force: true,
          limit: 50
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Collaboration pub/sub delivery failed.");
      await refreshEnterpriseCollaboration(projectId);
      setEnterpriseMessage(`Collaboration pub/sub delivery checked: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Collaboration pub/sub delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function submitEnterprisePlatformDecisionReview() {
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording platform decisions.");
      return;
    }
    if (!platformDecisionOwnerName.trim() || !platformDecisionOwnerRole.trim() || !platformDecisionEnvironment.trim() || !platformDecisionNotes.trim()) {
      setEnterpriseMessage("Add owner, role, environment, and notes before recording a platform decision.");
      return;
    }
    const platformDecisionEvidenceUrlValue = platformDecisionEvidenceUrl.trim();
    if (platformDecisionRequiresIdentityEvidenceUrl && !platformDecisionEvidenceUrlValue) {
      setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
      return;
    }
    if (platformDecisionRequiresIdentityEvidenceUrl) {
      let platformDecisionEvidenceUrlParsed: URL;
      try {
        platformDecisionEvidenceUrlParsed = new URL(platformDecisionEvidenceUrlValue);
      } catch {
        setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
        return;
      }
      if (platformDecisionEvidenceUrlParsed.protocol !== "https:") {
        setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
        return;
      }
      const platformDecisionSensitiveQueryParameterNames = new Set(
        (platformRequestPacket?.submission.evidenceUrlPolicy.rejectedSensitiveQueryParameters ?? [])
          .map((parameter) => parameter.trim().toLowerCase())
      );
      const platformDecisionRejectedSensitiveQueryParameters = Array.from(platformDecisionEvidenceUrlParsed.searchParams.keys())
        .map((parameter) => parameter.trim().toLowerCase())
        .filter((parameter) => platformDecisionSensitiveQueryParameterNames.has(parameter));
      if (
        platformDecisionEvidenceUrlParsed.username ||
        platformDecisionEvidenceUrlParsed.password ||
        platformDecisionEvidenceUrlParsed.hash ||
        platformDecisionRejectedSensitiveQueryParameters.length > 0
      ) {
        setEnterpriseMessage("Evidence URL must not include embedded credentials, fragments, or sensitive query parameters.");
        return;
      }
    }
    const productionEvidenceVerifiedAtValue = platformDecisionProductionEvidenceVerifiedAt.trim();
    if (platformDecisionRequiresIdentityEvidenceTimestamp && !productionEvidenceVerifiedAtValue) {
      setEnterpriseMessage("Add a production evidence verified-at timestamp before recording identity production evidence.");
      return;
    }
    const productionEvidenceVerifiedAtMs = productionEvidenceVerifiedAtValue ? Date.parse(productionEvidenceVerifiedAtValue) : Number.NaN;
    if (productionEvidenceVerifiedAtValue && !Number.isFinite(productionEvidenceVerifiedAtMs)) {
      setEnterpriseMessage("Add a valid production evidence verified-at timestamp before recording platform evidence.");
      return;
    }
    if (productionEvidenceVerifiedAtMs > Date.now()) {
      setEnterpriseMessage("Production evidence verified-at cannot be in the future.");
      return;
    }
    const productionEvidenceVerifiedAtIso = productionEvidenceVerifiedAtValue
      ? new Date(productionEvidenceVerifiedAtMs).toISOString()
      : undefined;
    const requestPacketPolicyHash = platformDecisionStatus === "accepted" && platformDecisionProductionEvidenceIds.length > 0
      ? platformRequestPacketPolicyHash
      : undefined;
    if (platformDecisionStatus === "accepted" && platformDecisionProductionEvidenceIds.length > 0 && !requestPacketPolicyHash) {
      setEnterpriseMessage("Load the current identity request packet before recording identity production evidence.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          decisionId: platformDecisionId,
          status: platformDecisionStatus,
          acceptedBridge: platformDecisionStatus === "accepted" && platformDecisionAcceptBridge,
          ownerName: platformDecisionOwnerName,
          ownerRole: platformDecisionOwnerRole,
          environment: platformDecisionEnvironment,
          evidenceUrl: platformDecisionEvidenceUrlValue || undefined,
          productionEvidenceIds: platformDecisionStatus === "accepted" ? platformDecisionProductionEvidenceIds : [],
          productionEvidenceVerifiedAt: productionEvidenceVerifiedAtIso,
          requestPacketPolicyHash,
          notes: platformDecisionNotes
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Platform decision review failed.");
      setPlatformDecisionEvidenceUrl("");
      setPlatformDecisionProductionEvidenceIds([]);
      setPlatformDecisionProductionEvidenceVerifiedAt("");
      setPlatformDecisionNotes("");
      if (payload.platformDecisionRegister || payload.acceptance) {
        if (payload.identityProductionEvidence?.schemaVersion === "sena-enterprise-identity-production-evidence/v1") {
          setEnterpriseIdentityProductionEvidence(payload.identityProductionEvidence as EnterpriseIdentityProductionEvidenceDossier);
        }
        await refreshEnterprisePlatformDecisionState(activeEnterpriseTeamId);
        await refreshEnterpriseProvisioningReadiness({ silent: true });
      }
      const missingProductionEvidenceIds = Array.isArray(payload.acceptance?.productionEvidenceReceipt?.missingEvidenceIds)
        ? payload.acceptance.productionEvidenceReceipt.missingEvidenceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [];
      const productionEvidenceReceiptMessage = missingProductionEvidenceIds.length > 0
        ? ` Missing production evidence: ${missingProductionEvidenceIds.join(", ")}.`
        : "";
      const identityProductionEvidenceMessage = payload.identityProductionEvidence?.schemaVersion === "sena-enterprise-identity-production-evidence/v1"
        ? ` identity verifier ${payload.identityProductionEvidence.submissionVerifier.summary.incompleteDecisions} incomplete · identity blockers ${payload.identityProductionEvidence.platformRequestPacket.summary.blockingRequests}.`
        : "";
      setEnterpriseMessage(`Platform decision recorded: ${payload.acceptance?.decisionId ?? platformDecisionId} · ${payload.acceptance?.status ?? platformDecisionStatus}.${productionEvidenceReceiptMessage}${identityProductionEvidenceMessage}`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Platform decision review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function submitEnterpriseReleaseGateReview() {
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording release gate reviews.");
      return;
    }
    if (!releaseGateApproverName.trim() || !releaseGateApproverRole.trim() || !releaseGateEnvironment.trim() || !releaseGateVersion.trim() || !releaseGateNotes.trim() || !releaseGateVerificationSummary.trim()) {
      setEnterpriseMessage("Add approver, role, environment, release version, notes, and verification evidence before recording a release gate review.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/ops/release-gate", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          environment: releaseGateEnvironment,
          releaseVersion: releaseGateVersion,
          decision: releaseGateDecision,
          approverName: releaseGateApproverName,
          approverRole: releaseGateApproverRole,
          notes: releaseGateNotes,
          verificationCommand: "npm run sena:pilot:verify",
          verificationEvidence: {
            status: releaseGateVerificationStatus,
            summary: releaseGateVerificationSummary,
            outputSha256: /^[a-f0-9]{64}$/i.test(releaseGateVerificationHash.trim()) ? releaseGateVerificationHash.trim() : undefined
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Release gate review failed.");
      setReleaseGateNotes("");
      await refreshEnterpriseReleaseGateReviews(activeEnterpriseTeamId);
      await refreshEnterpriseProvisioningReadiness();
      setEnterpriseMessage(`Release gate recorded: ${payload.review?.releaseVersion ?? releaseGateVersion} · ${payload.review?.decision ?? releaseGateDecision} · release gate identity ${payload.review?.identityProductionSnapshot?.status ?? "missing"} · verifier ${payload.review?.identityProductionSnapshot?.submissionVerifier.incompleteDecisions ?? "missing"} incomplete · rotation ${payload.review?.identityProductionSnapshot?.rotationFreshness.status ?? "missing"} · cutover ${payload.review?.identityProductionSnapshot?.cutoverChecklist.status ?? "missing"} · cutover blockers ${payload.review?.identityProductionSnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"} · blocked ${payload.review?.identityProductionSnapshot?.releaseGateBlocked ? "yes" : "no"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Release gate review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  const refreshEnterpriseState = useCallback(async () => {
    try {
      const meResponse = await fetch("/api/auth/me");
      const me = await meResponse.json();
      if (!meResponse.ok || !me.user) {
        enterpriseCsrfRef.current = null;
        setEnterpriseContext(null);
        setEnterpriseProjects([]);
        setEnterpriseTeamState(null);
        setEnterpriseMfaStatus(null);
        setEnterpriseMfaSetup(null);
        setEnterpriseSessionList(null);
        setEnterpriseSsoPreflight(null);
        setEnterpriseDeploymentPackage(null);
        setEnterpriseIdentityProductionEvidence(null);
        setEnterpriseImportRuns([]);
        setEnterpriseAnalysisRuns([]);
        setEnterpriseClaimPackage(null);
        setEnterprisePlatformDecisionState(null);
        setEnterpriseReleaseGateState(null);
        return;
      }
      const nextContext = me as EnterpriseContext;
      setEnterpriseContext(nextContext);
      void refreshEnterpriseTeamState().catch(() => setEnterpriseTeamState(null));
      void refreshEnterpriseMfaState().catch(() => setEnterpriseMfaStatus(null));
      void refreshEnterpriseSessionList().catch(() => setEnterpriseSessionList(null));

      const projectsResponse = await fetch("/api/sena/projects");
      const projects = await projectsResponse.json();
      if (projectsResponse.ok) setEnterpriseProjects(projects.projects ?? []);
      const teamId = nextContext.teams[0]?.id;
      if (teamId) {
        void refreshEnterprisePlatformDecisionState(teamId).catch(() => setEnterprisePlatformDecisionState(null));
        void refreshEnterpriseReleaseGateReviews(teamId).catch(() => setEnterpriseReleaseGateState(null));
        const importsResponse = await fetch(`/api/sena/import?teamId=${encodeURIComponent(teamId)}`);
        const imports = await importsResponse.json();
        if (importsResponse.ok) setEnterpriseImportRuns(imports.importRuns ?? []);
        const analysisResponse = await fetch(`/api/sena/analyze?teamId=${encodeURIComponent(teamId)}`);
        const analysis = await analysisResponse.json();
        if (analysisResponse.ok) setEnterpriseAnalysisRuns(analysis.analysisRuns ?? []);
      }
    } catch {
      setEnterpriseContext(null);
      setEnterpriseTeamState(null);
      setEnterpriseMfaStatus(null);
      setEnterpriseMfaSetup(null);
      setEnterpriseSessionList(null);
      setEnterpriseSsoPreflight(null);
      setEnterpriseDeploymentPackage(null);
      setEnterpriseIdentityProductionEvidence(null);
      setEnterpriseImportRuns([]);
      setEnterpriseAnalysisRuns([]);
      setEnterpriseClaimPackage(null);
      setEnterprisePlatformDecisionState(null);
      setEnterpriseReleaseGateState(null);
    }
  }, [refreshEnterpriseMfaState, refreshEnterprisePlatformDecisionState, refreshEnterpriseReleaseGateReviews, refreshEnterpriseSessionList, refreshEnterpriseTeamState]);

  async function refreshEnterpriseCollaboration(projectId = activeEnterpriseProjectId) {
    if (!projectId) {
      setEnterpriseCollaboration(null);
      setEnterpriseClaimPackage(null);
      return;
    }
    try {
      const response = await fetch(`/api/sena/projects/${projectId}/collaboration`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load collaboration state.");
      setEnterpriseCollaboration(payload);
      const claimResponse = await fetch(`/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`);
      const claimPayload = await claimResponse.json();
      setEnterpriseClaimPackage(claimResponse.ok ? claimPayload as EnterpriseClaimEvidencePackage : null);
    } catch (error) {
      setEnterpriseClaimPackage(null);
      setEnterpriseMessage(error instanceof Error ? error.message : "Could not load collaboration state.");
    }
  }

  async function touchEnterprisePresence(projectId = activeEnterpriseProjectId, options: { quiet?: boolean } = {}) {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/sena/projects/${projectId}/collaboration`, {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "presence",
          activeView: workspaceRailMode,
          cursorLabel: activePlotView
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Presence update failed.");
      if (!options.quiet) {
        await refreshEnterpriseCollaboration(projectId);
        setEnterpriseMessage("Presence synced for the active SENA project.");
      }
    } catch (error) {
      if (!options.quiet) setEnterpriseMessage(error instanceof Error ? error.message : "Presence update failed.");
    }
  }

  async function addEnterpriseComment() {
    if (!activeEnterpriseProjectId || !enterpriseComment.trim()) return;
    try {
      const response = await fetch(`/api/sena/projects/${activeEnterpriseProjectId}/collaboration`, {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "comment",
          body: enterpriseComment,
          target: { kind: selected && "layer" in selected ? "edge" : selected?.kind === "person" || selected?.kind === "concept" ? "node" : "project", id: selected?.id, label: selected?.label }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Comment failed.");
      setEnterpriseComment("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage("Project comment added.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Comment failed.");
    }
  }

  async function addEnterpriseAdjudication() {
    if (!activeEnterpriseProjectId || !adjudicationItemId.trim() || !adjudicationCodeId.trim()) return;
    try {
      const response = await fetch(`/api/sena/projects/${activeEnterpriseProjectId}/collaboration`, {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "adjudication",
          reliabilityRunId: latestEnterpriseReliabilityRun?.id,
          itemId: adjudicationItemId,
          codeId: adjudicationCodeId,
          decision: adjudicationDecision,
          notes: adjudicationNotesQuick
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Adjudication failed.");
      setAdjudicationItemId("");
      setAdjudicationCodeId("");
      setAdjudicationNotesQuick("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage("Adjudication record added to the project history.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Adjudication failed.");
    }
  }

  async function reviewEnterpriseReliabilityRun(status: "approved" | "rejected" | "pending-adjudication") {
    if (!latestEnterpriseReliabilityRun) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/reliability", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          runId: latestEnterpriseReliabilityRun.id,
          status,
          notes: reliabilityReviewNote
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Reliability review failed.");
      setReliabilityReviewNote("");
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Reliability run ${payload.reliabilityRun.id} marked ${payload.reliabilityRun.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Reliability review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  function applyReliabilityReviewPatch(review: Partial<SenaCodingReliabilityReview>) {
    setCodingReliabilityStatus(review.status ?? "documented");
    setCodingReliabilityReviewer(review.reviewer ?? codingReliabilityReviewer ?? reviewer);
    setCodingScheme(review.codingScheme ?? codingScheme);
    setUnitOfCoding(review.unitOfCoding ?? unitOfCoding);
    setCoderCount(Number(review.coderCount ?? coderCount));
    setAgreementMetric(review.agreementMetric ?? agreementMetric);
    setAgreementValue(review.agreementValue ?? agreementValue);
    setAdjudicationNotes(review.adjudicationNotes ?? adjudicationNotes);
    setReliabilityLimitations(review.limitations ?? reliabilityLimitations);
  }

  async function importReliabilityFilesLocally(files: File[]) {
    setEnterpriseBusy(true);
    try {
      const { importSenaReliabilityFiles } = await import("@/lib/sena/reliability-adapters");
      const result = await importSenaReliabilityFiles(files, codingReliabilityReviewer || reviewer || "SENA reliability workflow");
      setLocalEnterpriseReliabilityResult(result);
      applyReliabilityReviewPatch(result.reviewPatch);
      setEnterpriseMessage(`Local reliability dashboard calculated without sign-in: kappa ${result.dashboard.meanPairwiseKappa}, alpha ${result.dashboard.krippendorffAlphaNominal}, disagreements ${result.dashboard.disagreementCount}. Sign in to persist reliability runs and adjudication coverage.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Local reliability calculation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function runEnterpriseValidationComparison(mode: "single" | "suite" = "single") {
    if (!selectedValidationGroupA || !selectedValidationGroupB || selectedValidationGroupA === selectedValidationGroupB) {
      setEnterpriseMessage("Choose two different groups or roles before running validation.");
      return;
    }
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      if (mode === "suite") {
        await runValidationComparisonLocally("suite");
      } else {
        await runValidationComparisonLocally();
      }
      return;
    }
    setEnterpriseBusy(true);
    try {
      const studySpecificInferenceReference = validationStudySpecificInferenceReference.trim();
      const response = await fetch("/api/sena/validation/group-comparison", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: buildCurrentProjectSnapshot(),
          groupField: validationGroupField,
          groupA: selectedValidationGroupA,
          groupB: selectedValidationGroupB,
          ...(mode === "suite" ? {
            suite: true,
            metrics: enterpriseValidationMetrics.map((metric) => metric.value)
          } : {
            metric: validationMetric
          }),
          iterations: 1000,
          seed: 20260611,
          preregistrationNote: validationPreregistrationNote,
          methodNote: validationMethodNote,
          parityEvidence: studySpecificInferenceReference ? {
            studySpecificInferenceReference
          } : undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Group-comparison validation failed.");
      setLocalEnterpriseValidationResult(null);
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      const suiteSummary = payload.schemaVersion === "sena-group-comparison-suite/v1"
        ? `Holm suite ${payload.comparisonCount} comparisons, min adjusted p=${payload.validationRun?.minHolmAdjustedP ?? payload.primary?.holmAdjustedP}.`
        : `${payload.metric} ${payload.groupA} vs ${payload.groupB}, p=${payload.permutation.pTwoSided}.`;
      setEnterpriseMessage(`Validation run ${payload.validationRun?.id ?? "local"} saved: ${suiteSummary}`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Group-comparison validation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function runValidationComparisonLocally(mode: "single" | "suite" = "single") {
    setEnterpriseBusy(true);
    try {
      const { buildSenaGroupComparison, buildSenaGroupComparisonSuite } = await import("@/lib/sena/inference");
      const result = mode === "suite"
        ? buildSenaGroupComparisonSuite({
          dataset,
          buildOptions,
          comparisons: enterpriseValidationMetrics.map((metric) => ({
            groupField: validationGroupField,
            groupA: selectedValidationGroupA,
            groupB: selectedValidationGroupB,
            metric: metric.value
          })),
          iterations: 1000,
          seed: 20260611,
          bootstrapIterations: 1000,
          alpha: 0.05
        })
        : buildSenaGroupComparison({
          dataset,
          buildOptions,
          groupField: validationGroupField,
          groupA: selectedValidationGroupA,
          groupB: selectedValidationGroupB,
          metric: validationMetric,
          iterations: 1000,
          seed: 20260611,
          bootstrapIterations: 1000
        });
      const preregistrationPlan = await buildLocalValidationPreregistrationPlan({
        result,
        preregistrationNote: validationPreregistrationNote,
        methodNote: validationMethodNote
      });
      const localRun: LocalEnterpriseValidationResult = {
        schemaVersion: "sena-local-validation-run/v1",
        generatedAt: new Date().toISOString(),
        result,
        preregistrationNote: validationPreregistrationNote,
        methodNote: validationMethodNote,
        studySpecificInferenceReference: validationStudySpecificInferenceReference.trim(),
        preregistrationPlan
      };
      setLocalEnterpriseValidationResult(localRun);
      setEnterpriseMessage(`Local group-comparison validation calculated without sign-in: ${validationSuiteSummary(result) ?? validationResultSummary(result)}. Sign in to persist validation runs, review status, and claim-package evidence.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Local group-comparison validation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function reviewEnterpriseValidationRun(status: "approved" | "rejected") {
    if (!latestEnterpriseValidationRun) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/validation/group-comparison", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          runId: latestEnterpriseValidationRun.id,
          status,
          notes: validationReviewNote
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Validation review failed.");
      setValidationReviewNote("");
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Validation run ${payload.validationRun.id} marked ${payload.validationRun.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Validation review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function submitEnterpriseExpertReview(status: "approved" | "changes-requested" | "rejected" = "approved") {
    if (!activeEnterpriseProjectId) {
      setEnterpriseMessage("Save or select a server project before recording expert review.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/validation/expert-review", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          projectId: activeEnterpriseProjectId,
          target: { kind: latestEnterpriseValidationRun ? "validation-run" : "project", id: latestEnterpriseValidationRun?.id, label: latestEnterpriseValidationRun ? "Latest validation run" : "Project claim review" },
          reviewerName: expertReviewerName || undefined,
          expertiseArea: expertExpertiseArea || undefined,
          status,
          claimScope: expertClaimScope,
          ratings: {
            dataAdequacy: expertDataAdequacy,
            methodFit: expertMethodFit,
            interpretationValidity: expertInterpretationValidity
          },
          concerns: expertConcerns,
          recommendations: expertRecommendations,
          limitations
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Expert review failed.");
      setExpertConcerns("");
      setExpertRecommendations("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Expert review ${payload.expertReview.id} recorded: ${payload.expertReview.status}, ${payload.expertReview.claimScope}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Expert review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function updateEnterpriseExpertReview(status: "approved" | "changes-requested" | "rejected") {
    if (!latestEnterpriseExpertReview) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/validation/expert-review", {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          reviewId: latestEnterpriseExpertReview.id,
          status,
          claimScope: expertClaimScope,
          ratings: {
            dataAdequacy: expertDataAdequacy,
            methodFit: expertMethodFit,
            interpretationValidity: expertInterpretationValidity
          },
          concerns: expertConcerns || latestEnterpriseExpertReview.concerns,
          recommendations: expertRecommendations || latestEnterpriseExpertReview.recommendations,
          limitations
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Expert review update failed.");
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Expert review ${payload.expertReview.id} marked ${payload.expertReview.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Expert review update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function importFilesViaEnterpriseApi(files: File[]) {
    if (!enterpriseContext?.user) {
      await importFilesLocallyWithEnterpriseAdapters(files);
      return;
    }
    setEnterpriseBusy(true);
    setWorkspaceRailMode("sets");
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      if (activeEnterpriseTeamId) form.append("teamId", activeEnterpriseTeamId);
      form.append("action", "create-project");
      form.append("includeRuntimeBundle", "true");
      const importTitle = files.length === 1
        ? files[0].name.replace(/\.[^.]+$/, "") || "Imported SENA Project"
        : `Imported SENA Project (${files.length} files)`;
      form.append("title", importTitle);
      form.append("description", `Created from enterprise import of ${files.map((file) => file.name).join(", ")}.`);
      const response = await fetch("/api/sena/import", {
        method: "POST",
        headers: await enterpriseCsrfHeaders(),
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise import failed.");
      if (payload.persistedProject?.snapshot) {
        restoreProjectSnapshot(payload.persistedProject.snapshot, payload.persistedProject.title);
        setActiveEnterpriseProjectId(payload.persistedProject.id);
      } else {
        setDataset(payload.dataset);
        setUploadedTables([]);
        setDemoManualReviews({});
        setSelectedId("");
      }
      setImportMessage(`Enterprise import loaded ${files.length} file${files.length === 1 ? "" : "s"}: ${payload.sources?.map((source: { profile: string }) => source.profile).join(", ") || "adapter"}.`);
      setImportError(payload.warnings?.length ? payload.warnings.slice(0, 3).join(" ") : null);
      if (payload.importRun) setEnterpriseImportRuns((runs) => [payload.importRun, ...runs.filter((run) => run.id !== payload.importRun.id)]);
      if (payload.persistedProject) {
        setEnterpriseProjects((projects) => [
          payload.persistedProject,
          ...projects.filter((project) => project.id !== payload.persistedProject.id)
        ]);
      }
      if (payload.enterpriseAnalysisRun) {
        setEnterpriseAnalysisRuns((runs) => [
          payload.enterpriseAnalysisRun,
          ...runs.filter((run) => run.id !== payload.enterpriseAnalysisRun.id)
        ]);
      }
      const scanSummary = payload.uploads?.map((upload: { scanStatus?: string }) => upload.scanStatus ?? "unscanned").join(", ") || "unscanned";
      const manifestSummary = payload.cleaningManifest?.schemaVersion
        ? `; cleaning manifest ${payload.cleaningManifest.checks?.filter((check: { status: string }) => check.status === "review").length ?? 0} review checks`
        : "";
      const projectSummary = payload.persistedProject
        ? `; saved project ${payload.persistedProject.title} (${payload.persistedProject.id}) with analysis ${payload.enterpriseAnalysisRun?.id ?? "run"}`
        : "";
      setEnterpriseMessage(`Enterprise import ${payload.importRun?.id ?? "run"} completed: ${payload.importRun?.datasetCounts?.people ?? payload.dataset.people.length} people, ${payload.importRun?.datasetCounts?.utterances ?? payload.dataset.utterances.length} utterances, ${payload.importRun?.warningCount ?? payload.warnings?.length ?? 0} warnings; upload scan ${scanSummary}${manifestSummary}${projectSummary}.`);
      setLocalEnterpriseImportResult(null);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      if (payload.persistedProject?.id) {
        await refreshEnterpriseState();
        await refreshEnterpriseCollaboration(payload.persistedProject.id);
        await touchEnterprisePresence(payload.persistedProject.id, { quiet: true });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Enterprise import failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function importFilesLocallyWithEnterpriseAdapters(files: File[]) {
    setEnterpriseBusy(true);
    setWorkspaceRailMode("sets");
    try {
      const { importSenaEnterpriseFiles } = await import("@/lib/sena/import-adapters");
      const result = await importSenaEnterpriseFiles(files);
      setDataset(result.dataset);
      setUploadedTables([]);
      setDemoManualReviews({});
      setSelectedId("");
      setLocalEnterpriseImportResult(result);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      const profiles = result.sources.map((source) => `${source.profile}:${source.rows}`).join(", ") || "adapter";
      const reviewChecks = result.cleaningManifest.checks.filter((check) => check.status === "review").length;
      setImportMessage(`Local enterprise import loaded ${files.length} file${files.length === 1 ? "" : "s"}: ${profiles}; cleaning manifest ${reviewChecks} review checks.`);
      setImportError(result.warnings.length ? result.warnings.slice(0, 3).join(" ") : null);
      setEnterpriseMessage(`Local import completed without sign-in: ${result.dataset.people.length} people, ${result.dataset.utterances.length} utterances, ${result.warnings.length} warnings. Sign in to persist uploads, import runs, and saved projects.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Local enterprise import failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function saveEnterpriseProject() {
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in before saving server-side SENA projects.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const snapshot = buildCurrentProjectSnapshot();
      const method = activeEnterpriseProjectId ? "PUT" : "POST";
      const url = activeEnterpriseProjectId ? `/api/sena/projects/${activeEnterpriseProjectId}` : "/api/sena/projects";
      const activeProjectSummary = enterpriseProjects.find((project) => project.id === activeEnterpriseProjectId);
      const expectedVersion = activeEnterpriseProjectId
        ? enterpriseCollaboration?.project.id === activeEnterpriseProjectId
          ? enterpriseCollaboration.project.currentVersion
          : activeProjectSummary?.currentVersion
        : undefined;
      const response = await fetch(url, {
        method,
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          title: reportTitle,
          description: `Saved from /workspace/sena with ${model.summary.people} people and ${model.summary.concepts} codes.`,
          expectedVersion,
          snapshot
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409 && activeEnterpriseProjectId) {
          await refreshEnterpriseState();
          await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
        }
        throw new Error(response.status === 409
          ? `${payload.error || "Project version conflict."} Refresh the server project before saving again.`
          : payload.error || "Project save failed.");
      }
      setActiveEnterpriseProjectId(payload.project.id);
      setEnterpriseMessage(`${payload.project.title} saved to ${enterpriseContext.teams[0]?.name ?? "SENA team"} at version ${payload.project.currentVersion}.`);
      await refreshEnterpriseState();
      await refreshEnterpriseCollaboration(payload.project.id);
      await touchEnterprisePresence(payload.project.id);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Project save failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function runEnterpriseAnalysis() {
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in before running server-side SENA analysis.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/analyze", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: activeEnterpriseProjectId ? undefined : buildCurrentProjectSnapshot(),
          title: reportTitle,
          includeRuntimeBundle: true,
          persist: false
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Server-side SENA analysis failed.");
      if (payload.enterpriseAnalysisRun) {
        setEnterpriseAnalysisRuns((runs) => [
          payload.enterpriseAnalysisRun,
          ...runs.filter((run) => run.id !== payload.enterpriseAnalysisRun.id)
        ]);
      }
      setEnterpriseMessage(`Server analysis ${payload.enterpriseAnalysisRun?.id ?? "run"} recorded: ${payload.summary.people} people, ${payload.summary.concepts} codes, ${payload.summary.claimUse}.`);
      await refreshEnterpriseState();
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Server-side SENA analysis failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function openEnterpriseProject(projectId: string) {
    if (!projectId) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not open project.");
      restoreProjectSnapshot(payload.project.snapshot, payload.project.title);
      setActiveEnterpriseProjectId(projectId);
      setEnterpriseMessage(`${payload.project.title} opened from server project storage.`);
      await refreshEnterpriseCollaboration(projectId);
      await touchEnterprisePresence(projectId);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Could not open project.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function restoreEnterpriseProjectRevision(revisionId: string) {
    if (!activeEnterpriseProjectId || !enterpriseCollaboration) return;
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/projects/${activeEnterpriseProjectId}`, {
        method: "PATCH",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "restore-revision",
          revisionId,
          expectedVersion: enterpriseCollaboration.project.currentVersion
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
        throw new Error(response.status === 409
          ? `${payload.error || "Project revision restore conflict."} Refresh the project history before restoring again.`
          : payload.error || "Project revision restore failed.");
      }
      restoreProjectSnapshot(payload.project.snapshot, `${payload.project.title} v${payload.restoredFrom.version}`);
      setActiveEnterpriseProjectId(payload.project.id);
      setEnterpriseMessage(`${payload.project.title} restored from version ${payload.restoredFrom.version} into version ${payload.project.currentVersion}.`);
      await refreshEnterpriseState();
      await refreshEnterpriseCollaboration(payload.project.id);
      await touchEnterprisePresence(payload.project.id);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Project revision restore failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function exportPublication(format: PublicationFormat) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before using enterprise publication exports.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/exports/publication", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          format,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: activeEnterpriseProjectId ? undefined : buildCurrentProjectSnapshot()
        })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Publication export failed.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `sena-publication.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      const exportSource = activeEnterpriseProjectId ? "server project" : "workspace snapshot";
      setEnterpriseMessage(`${filename} exported from the enterprise publication API using ${exportSource}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Publication export failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  useEffect(() => {
    void refreshEnterpriseState();
  }, [refreshEnterpriseState]);

  useEffect(() => {
    if (!activeEnterpriseProjectId || !enterpriseUserId) {
      setEnterpriseCollaborationTransport("manual");
      return undefined;
    }

    let closed = false;
    const source = new EventSource(`/api/sena/projects/${activeEnterpriseProjectId}/collaboration/stream`);
    source.addEventListener("collaboration", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { collaboration?: EnterpriseCollaborationState };
        if (payload.collaboration) {
          setEnterpriseCollaboration(payload.collaboration);
          setEnterpriseCollaborationTransport("streaming");
        }
      } catch {
        setEnterpriseCollaborationTransport("reconnecting");
      }
    });
    source.onerror = () => {
      if (!closed) setEnterpriseCollaborationTransport("reconnecting");
    };

    return () => {
      closed = true;
      source.close();
      setEnterpriseCollaborationTransport("manual");
    };
  }, [activeEnterpriseProjectId, enterpriseUserId]);

  useEffect(() => {
    if (!activeEnterpriseProjectId || !enterpriseUserId) return undefined;
    const syncPresence = async () => {
      try {
        await fetch(`/api/sena/projects/${activeEnterpriseProjectId}/collaboration`, {
          method: "POST",
          headers: await enterpriseJsonHeaders(),
          body: JSON.stringify({
            action: "presence",
            activeView: workspaceRailMode,
            cursorLabel: activePlotView
          })
        });
      } catch {
        setEnterpriseCollaborationTransport("reconnecting");
      }
    };
    void syncPresence();
    const interval = window.setInterval(() => {
      void syncPresence();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [activeEnterpriseProjectId, activePlotView, enterpriseJsonHeaders, enterpriseUserId, workspaceRailMode]);

  useEffect(() => {
    setActiveWindowIndex(0);
    setIsAnimating(false);
  }, [dataset, temporalMode, movingWindowSize, movingWindowStep, turnWindowRadius]);

  useEffect(() => {
    if (!pendingActiveWindow) return;
    const restoredIndex = temporalWindows.findIndex((window) => (
      window.id === pendingActiveWindow.id ||
      (
        window.label === pendingActiveWindow.label &&
        window.startTurn === pendingActiveWindow.startTurn &&
        window.endTurn === pendingActiveWindow.endTurn
      )
    ));
    setActiveWindowIndex(restoredIndex >= 0 ? restoredIndex : 0);
    setPendingActiveWindow(null);
  }, [pendingActiveWindow, temporalWindows]);

  useEffect(() => {
    if (temporalWindows.length <= 1) setIsAnimating(false);
    setActiveWindowIndex((current) => Math.min(current, Math.max(0, temporalWindows.length - 1)));
  }, [temporalWindows.length]);

  useEffect(() => {
    if (!isAnimating || temporalWindows.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveWindowIndex((current) => (current + 1) % temporalWindows.length);
    }, animationMs);
    return () => window.clearInterval(interval);
  }, [animationMs, isAnimating, temporalWindows.length]);

  useEffect(() => {
    if (!isFusionPlotMaximized) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFusionPlotMaximized(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFusionPlotMaximized]);

  useEffect(() => {
    if (!isFusionPlotMaximized) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFusionPlotMaximized]);

  function zoomInFusionPlot() {
    setFusionPlotZoom((current) => clampFusionPlotZoom(current + fusionPlotZoomStep));
  }

  function zoomOutFusionPlot() {
    setFusionPlotZoom((current) => clampFusionPlotZoom(current - fusionPlotZoomStep));
  }

  function resetFusionPlotZoom() {
    setFusionPlotZoom(1);
  }

  function updateDemoManualReview(checkId: string, patch: Partial<SenaDemoVerificationCheck["manualReview"]>) {
    setDemoManualReviews((current) => {
      const existing = current[checkId] ?? {
        status: "pending",
        reviewer: "",
        verifiedAt: "",
        notes: ""
      };
      const next = {
        ...existing,
        ...patch
      };
      if (next.status === "pending") next.verifiedAt = "";
      return {
        ...current,
        [checkId]: next
      };
    });
  }

  function handleWorkspaceRailChange(mode: WorkspaceRailMode) {
    setWorkspaceRailMode(mode);
    setIsPlotSwitcherOpen(false);
    if (mode === "stats") {
      setActivePlotView("sna");
      return;
    }
    if (mode === "plots") {
      setActivePlotView("fusion");
    }
  }

  function applyDemoVerificationManualReviews(verification: SenaDemoVerification, fileName: string) {
    const compatibility = buildSenaDemoVerificationCompatibilityAudit(model, verification);
    if (compatibility.status !== "compatible") {
      const mismatch = compatibility.items.filter((item) => item.status === "review").map((item) => item.label).join(", ");
      setImportError(`${fileName}: demo verification does not match the active model (${mismatch}). Load the matching snapshot or dataset before applying manual-review records.`);
      return;
    }

    const manualReviews = Object.fromEntries(verification.checks.map((check) => [check.id, check.manualReview])) as DemoManualReviewState;
    setDemoManualReviews(manualReviews);
    setImportMessage(`${fileName}: demo verification manual-review records applied (${verification.summary.manualPassed} passed, ${verification.summary.manualFailed} failed, ${verification.summary.manualPending} pending).`);
    setImportError(null);
  }

  function applyMappedTables(tables: UploadedSenaTable[]) {
    const result = buildSenaDatasetFromTables(tables);
    setDataset(result.dataset);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setDemoManualReviews({});
    setImportMessage(`${tables.length} mapped table${tables.length === 1 ? "" : "s"} loaded.`);
    setImportError(null);
  }

  function commitUploadedTables(tables: UploadedSenaTable[]) {
    setUploadedTables(tables);
    applyMappedTables(tables);
  }

  function restoreProjectSnapshot(snapshot: SenaProjectSnapshot, fileName: string) {
    const options = snapshot.reproducibility.buildOptions;
    const sourceDataset = snapshot.source.sourceDataset ?? snapshot.dataset;
    const review = snapshot.report.humanReview;
    const reliability = snapshot.report.codingReliabilityGate?.review;
    const governance = snapshot.dataGovernance ?? snapshot.report.dataGovernance;
    const restoredManualReviews = snapshot.workspaceState?.demoVerificationManualReviews ?? {};

    setDataset(sourceDataset);
    setUploadedTables([]);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setAlpha(options.alpha);
    setBeta(options.beta);
    setGamma(options.gamma);
    setNormalization(options.normalization);
    setTemporalMode(options.temporal.mode);
    setMovingWindowSize(options.temporal.movingWindowSize);
    setMovingWindowStep(options.temporal.movingWindowStep);
    setTurnWindowRadius(options.temporal.turnWindowRadius);
    setReportTitle(snapshot.title || snapshot.report.title || "SENA Analysis Report");
    setReviewStatus(review.status);
    setReviewer(review.reviewer);
    setInterpretation(review.interpretation);
    setLimitations(review.limitations);
    setNextActions(review.nextActions);
    if (reliability) {
      setCodingReliabilityStatus(reliability.status);
      setCodingReliabilityReviewer(reliability.reviewer);
      setCodingScheme(reliability.codingScheme);
      setUnitOfCoding(reliability.unitOfCoding);
      setCoderCount(reliability.coderCount);
      setAgreementMetric(reliability.agreementMetric);
      setAgreementValue(reliability.agreementValue);
      setAdjudicationNotes(reliability.adjudicationNotes);
      setReliabilityLimitations(reliability.limitations);
    }
    setDataGovernanceIrbApprovalId(governance?.irbApprovalId ?? "");
    setDataGovernanceConsentScope(governance?.consentScope ?? "");
    setDataGovernanceRetentionPolicy(governance?.retentionPolicy ?? "");
    setDataGovernanceUsageConstraints((governance?.usageConstraints ?? []).join("\n"));
    setDataGovernanceDataSteward(governance?.dataSteward ?? "");
    setDemoManualReviews(restoredManualReviews);
    setSelectedId("");
    setPendingActiveWindow(snapshot.source.activeTemporalWindow);
    setImportMessage(`${fileName}: project snapshot restored${Object.keys(restoredManualReviews).length > 0 ? " with demo verification records" : ""}.`);
    setImportError(null);
  }

  async function handleContractUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    setWorkspaceRailMode("sets");
    if (files.some((file) => !/\.(csv|json)$/i.test(file.name))) {
      await importFilesViaEnterpriseApi(files);
      input.value = "";
      return;
    }

    try {
      const nextTables: UploadedSenaTable[] = [];
      for (const file of files) {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === "sena-project-snapshot/v1"
          ) {
            restoreProjectSnapshot(importSenaProjectSnapshot(parsed), file.name);
            continue;
          }

          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === "sena-review-packet/v1"
          ) {
            const packet = importSenaReviewPacket(parsed);
            restoreProjectSnapshot(packet.contents.projectSnapshot, file.name);
            setImportMessage(`${file.name}: review packet restored editable workspace state (${packet.reviewPacketAudit.status}; ${packet.summary.pilotReadinessStatus}).`);
            setImportError(null);
            continue;
          }

          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === "sena-demo-verification/v1"
          ) {
            applyDemoVerificationManualReviews(importSenaDemoVerification(parsed), file.name);
            continue;
          }

          const result = importSenaJsonContract(parsed);
          setDataset(result.dataset);
          setUploadedTables([]);
          setLocalEnterpriseImportResult(null);
          setLocalEnterpriseReliabilityResult(null);
          setLocalEnterpriseValidationResult(null);
          setDemoManualReviews({});
          setImportMessage(`${file.name}: JSON contract loaded.`);
          setImportError(null);
          continue;
        }

        const parsed = parseSenaCsv(text);
        const table = inferSenaTableFromName(file.name);
        nextTables.push({
          id: `${file.name}-${file.lastModified}-${nextTables.length}`,
          name: file.name,
          table,
          columns: parsed.columns,
          rows: parsed.rows,
          mapping: inferSenaColumnMapping(table, parsed.columns)
        });
      }

      if (nextTables.length > 0) {
        const combined = [...uploadedTables, ...nextTables];
        commitUploadedTables(combined);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "SENA import failed.");
    } finally {
      input.value = "";
    }
  }

  function updateUploadedTable(id: string, updater: (table: UploadedSenaTable) => UploadedSenaTable) {
    commitUploadedTables(uploadedTables.map((table) => table.id === id ? updater(table) : table));
  }

  function updateTableContract(id: string, table: SenaImportTable) {
    updateUploadedTable(id, (current) => ({
      ...current,
      table,
      mapping: inferSenaColumnMapping(table, current.columns)
    }));
  }

  function updateTableField(id: string, field: string, column: string) {
    updateUploadedTable(id, (current) => {
      const mapping = { ...current.mapping };
      if (column) mapping[field] = column;
      else delete mapping[field];
      return { ...current, mapping };
    });
  }

  function clearContract() {
    setWorkspaceRailMode("sets");
    setDataset(createEmptySenaDataset());
    setUploadedTables([]);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setDemoManualReviews({});
    setImportMessage("No SENA contract loaded.");
    setImportError(null);
    setSelectedId("");
  }

  async function loadLessonStudySample() {
    setWorkspaceRailMode("sets");
    setIsLoadingSample(true);
    try {
      const response = await fetch(lessonStudySampleUrl);
      if (!response.ok) throw new Error(`Could not load sample data (${response.status}).`);
      const result = importSenaJsonContract(await response.text());
      setDataset(result.dataset);
      setUploadedTables([]);
      setLocalEnterpriseImportResult(null);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      setReportTitle("Lesson Study SENA Analysis Report");
      setReviewStatus("draft");
      setReviewer("");
      setInterpretation("");
      setLimitations("");
      setNextActions("");
      setDemoManualReviews({});
      setSelectedId("");
      setImportMessage("Lesson-study sample loaded from the research pilot package.");
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not load the lesson-study sample.");
    } finally {
      setIsLoadingSample(false);
    }
  }

  async function handleReliabilityUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    if (!enterpriseContext?.user) {
      try {
        await importReliabilityFilesLocally(files);
      } finally {
        input.value = "";
      }
      return;
    }
    setEnterpriseBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      if (activeEnterpriseTeamId) form.append("teamId", activeEnterpriseTeamId);
      if (activeEnterpriseProjectId) form.append("projectId", activeEnterpriseProjectId);
      if (reviewer || codingReliabilityReviewer) form.append("reviewer", codingReliabilityReviewer || reviewer);
      const response = await fetch("/api/sena/reliability", {
        method: "POST",
        headers: await enterpriseCsrfHeaders(),
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Reliability calculation failed.");
      const review = payload.reviewPatch ?? {};
      applyReliabilityReviewPatch(review);
      setLocalEnterpriseReliabilityResult(null);
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Reliability run ${payload.reliabilityRun?.id ?? "local"} saved: kappa ${payload.dashboard.meanPairwiseKappa}, alpha ${payload.dashboard.krippendorffAlphaNominal}, disagreements ${payload.dashboard.disagreementCount}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Reliability calculation failed.");
    } finally {
      setEnterpriseBusy(false);
      input.value = "";
    }
  }

  function exportContractTemplate() {
    downloadText(
      "sena-data-contract-template.json",
      JSON.stringify({ people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] }, null, 2),
      "application/json"
    );
  }

  function toggleLayer(layer: SenaLayer) {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  function exportModel() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-project-snapshot.json",
      JSON.stringify(buildCurrentProjectSnapshot(generatedAt), null, 2),
      "application/json"
    );
  }

  function exportPairReport() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-person-code-pair-g-report.json",
      JSON.stringify(
        buildSenaPairContributionReportArtifact(model, {
          title: `${reportTitle} Person-Code-Pair G Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportSocialReport() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-sna-report.json",
      JSON.stringify(
        buildSenaSnaReportArtifact(model, {
          title: `${reportTitle} jSNA Social Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportMetricProvenance() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-metric-provenance.json",
      JSON.stringify(
        buildSenaMetricProvenanceArtifact(model, {
          title: `${reportTitle} Metric Provenance`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportEnaReport() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-ena-report.json",
      JSON.stringify(
        buildSenaEnaReportArtifact(model, {
          title: `${reportTitle} jENA Epistemic Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportEnaManifestJson() {
    downloadText(
      "sena-jena-manifest.json",
      JSON.stringify(enaManifest, null, 2),
      "application/json"
    );
  }

  function exportSnaManifestJson() {
    downloadText(
      "sena-jsna-manifest.json",
      JSON.stringify(snaManifest, null, 2),
      "application/json"
    );
  }

  function exportRuntimeBundleJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-runtime-bundle.json",
      JSON.stringify(
        buildSenaRuntimeBundle(model, {
          title: `${reportTitle} Runtime Bundle`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          sourceDataset: dataset,
          temporalRuntimeTrace,
          evidenceLimit: 500,
          demoVerificationManualReviews: demoManualReviews,
          humanReview: {
            status: reviewStatus,
            reviewer,
            reviewedAt: generatedAt,
            interpretation,
            limitations,
            nextActions
          },
          codingReliability: {
            ...codingReliabilityReview,
            reviewedAt: generatedAt
          },
          dataGovernance: dataGovernanceReview
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportRuntimeConsistencyAuditJson() {
    downloadText(
      "sena-runtime-consistency-audit.json",
      JSON.stringify(runtimeConsistencyAudit, null, 2),
      "application/json"
    );
  }

  function exportFusionMathAuditJson() {
    downloadText(
      "sena-fusion-math-audit.json",
      JSON.stringify(fusionMathAudit, null, 2),
      "application/json"
    );
  }

  function exportMethodProtocolJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-method-protocol.json",
      JSON.stringify(
        buildSenaMethodProtocol(model, {
          title: `${reportTitle} Method Protocol`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportVisualGrammarJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-visual-grammar.json",
      JSON.stringify(
        buildSenaVisualGrammarArtifact({
          title: `${reportTitle} Visual Grammar`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportDataContractAuditJson() {
    downloadText(
      "sena-data-contract-audit.json",
      JSON.stringify(sourceDataContractAudit, null, 2),
      "application/json"
    );
  }

  function exportEnterpriseCleaningManifestJson() {
    if (!latestImportCleaningManifest) {
      setEnterpriseMessage("Run an enterprise or local adapter import with a cleaning manifest before exporting.");
      return;
    }
    downloadText(
      "sena-import-cleaning-manifest.json",
      JSON.stringify(latestImportCleaningManifest, null, 2),
      "application/json"
    );
  }

  function exportEnterpriseValidationParityEvidenceJson() {
    if (!latestEnterpriseValidationRun?.parityEvidence) {
      setEnterpriseMessage("Run a group-comparison validation with parity evidence before exporting.");
      return;
    }
    downloadText(
      "sena-validation-parity-evidence.json",
      JSON.stringify(latestEnterpriseValidationRun.parityEvidence, null, 2),
      "application/json"
    );
    setEnterpriseMessage("Validation parity evidence exported.");
  }

  function enterpriseTeamQuery(prefix = "?") {
    return activeEnterpriseTeamId ? `${prefix}teamId=${encodeURIComponent(activeEnterpriseTeamId)}` : "";
  }

  function enterpriseExpertReviewQuery() {
    const params = new URLSearchParams();
    if (activeEnterpriseTeamId) params.set("teamId", activeEnterpriseTeamId);
    if (activeEnterpriseProjectId) params.set("projectId", activeEnterpriseProjectId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  async function exportEnterpriseJsonArtifact(url: string, filename: string, label: string) {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before exporting enterprise governance artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `${label} export failed.`);
      downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
      setEnterpriseMessage(`${label} exported.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : `${label} export failed.`);
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function exportEnterpriseExpertReviewDossierJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/validation/expert-review${enterpriseExpertReviewQuery()}`,
      "sena-enterprise-expert-review-dossier.json",
      "Enterprise expert review dossier"
    );
  }

  async function exportEnterpriseGovernanceHealthJson() {
    await exportEnterpriseJsonArtifact(
      "/api/sena/governance/health",
      "sena-enterprise-governance-health.json",
      "Enterprise governance health"
    );
  }

  async function exportEnterpriseSecurityPostureJson() {
    await exportEnterpriseJsonArtifact(
      "/api/sena/governance/security",
      "sena-enterprise-security-posture.json",
      "Enterprise security posture"
    );
  }

  async function exportEnterpriseBackupJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/governance/backup${enterpriseTeamQuery()}`,
      "sena-enterprise-backup.json",
      "Enterprise backup"
    );
  }

  async function exportEnterpriseAuditCsv() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before exporting enterprise governance artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/governance/audit?format=csv&integrity=1${enterpriseTeamQuery("&")}`);
      const text = await response.text();
      if (!response.ok) {
        let message = "Enterprise audit CSV export failed.";
        try {
          message = JSON.parse(text).error || message;
        } catch {
          message = text || message;
        }
        throw new Error(message);
      }
      downloadText("sena-enterprise-audit-log.csv", text, "text/csv");
      setEnterpriseMessage("Enterprise audit CSV exported.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise audit CSV export failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseAuditLogFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before delivering enterprise audit events.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/governance/audit", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId || undefined,
          force: true,
          limit: 100
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise audit delivery failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Audit delivery checked: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise audit delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function deliverEnterpriseBackupFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before delivering enterprise backup artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/governance/backup", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "deliver",
          teamId: activeEnterpriseTeamId || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise backup delivery failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Backup delivery ${payload.status ?? "checked"}: ${payload.backup?.recordCounts?.projects ?? 0} projects, ${payload.backup?.recordCounts?.auditEvents ?? 0} audit events.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise backup delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function syncEnterpriseDatabaseFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before running enterprise database sync.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/governance/backup", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          action: "sync-database",
          teamId: activeEnterpriseTeamId || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise database sync failed.");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Database sync ${payload.status ?? "checked"}: ${payload.backup?.recordCounts?.teams ?? 0} teams, ${payload.backup?.recordCounts?.projects ?? 0} projects.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise database sync failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function exportEnterpriseOpsStatusJson() {
    await exportEnterpriseJsonArtifact(
      "/api/sena/ops/status",
      "sena-enterprise-ops-status.json",
      "Enterprise ops status"
    );
  }

  async function exportEnterpriseOpsReadinessJson() {
    await exportEnterpriseJsonArtifact(
      "/api/sena/ops/readiness",
      "sena-enterprise-deployment-readiness.json",
      "Enterprise deployment readiness"
    );
  }

  async function exportEnterpriseDeploymentPackageJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/deployment${enterpriseTeamQuery()}`,
      "sena-enterprise-organization-deployment.json",
      "Enterprise deployment package"
    );
  }

  async function exportEnterpriseCapabilityAuditJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/capability-audit${enterpriseTeamQuery()}`,
      "sena-enterprise-capability-audit.json",
      "Enterprise capability audit"
    );
  }

  async function exportEnterpriseIdentityProductionEvidenceJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/identity-production-evidence${enterpriseTeamQuery()}`,
      "sena-enterprise-identity-production-evidence.json",
      "Enterprise identity production evidence"
    );
  }

  async function exportEnterpriseNativeAdapterCertificationJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/native-adapters${enterpriseTeamQuery()}`,
      "sena-enterprise-native-adapter-certification.json",
      "Enterprise native adapter certification"
    );
  }

  async function exportEnterpriseSaasOperationsReadinessJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/saas-operations${enterpriseTeamQuery()}`,
      "sena-enterprise-saas-operations-readiness.json",
      "Enterprise SaaS operations readiness"
    );
  }

  async function exportEnterpriseGoLiveRehearsalJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/go-live-rehearsal${enterpriseTeamQuery()}`,
      "sena-enterprise-go-live-rehearsal.json",
      "Enterprise go-live rehearsal"
    );
  }

  async function exportEnterpriseGoLiveRollbackDrillJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/go-live-rehearsal?artifact=rollback-drill${enterpriseTeamQuery("&")}`,
      "sena-enterprise-go-live-rollback-drill.json",
      "Enterprise go-live rollback drill"
    );
  }

  async function exportEnterpriseGoLiveMonitorJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/go-live-rehearsal?artifact=post-cutover-monitor${enterpriseTeamQuery("&")}`,
      "sena-enterprise-go-live-monitor.json",
      "Enterprise go-live monitor"
    );
  }

  async function applyEnterpriseGoLiveRehearsalDraft() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before applying the go-live rehearsal draft.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch(`/api/sena/ops/go-live-rehearsal${enterpriseTeamQuery()}`);
      const payload = await response.json() as Partial<EnterpriseGoLiveRehearsal> & { error?: string };
      if (!response.ok || payload.schemaVersion !== "sena-enterprise-go-live-rehearsal/v1" || payload.releaseGateDraft?.schemaVersion !== "sena-enterprise-release-gate-draft/v1") {
        throw new Error(payload.error || "Go-live rehearsal did not include a release gate draft.");
      }
      const draft = payload.releaseGateDraft;
      setReleaseGateDecision(draft.decision);
      setReleaseGateEnvironment(draft.environment);
      setReleaseGateVersion(draft.releaseVersion);
      setReleaseGateNotes(draft.notes);
      setReleaseGateVerificationStatus(draft.verificationEvidence.status);
      setReleaseGateVerificationSummary(draft.verificationEvidence.summary);
      setReleaseGateVerificationHash("");
      setEnterpriseMessage(`Go-live release gate draft applied: ${draft.releaseVersion} · ${draft.decision}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Go-live rehearsal draft failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function submitEnterpriseGoLiveAttestation() {
    if (!enterpriseContext?.user || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording go-live attestation.");
      return;
    }
    if (!releaseGateApproverName.trim() || !releaseGateApproverRole.trim() || !releaseGateEnvironment.trim() || !releaseGateVersion.trim() || !releaseGateNotes.trim()) {
      setEnterpriseMessage("Apply or complete release gate details before recording go-live attestation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/ops/go-live-rehearsal", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({
          teamId: activeEnterpriseTeamId,
          environment: releaseGateEnvironment,
          releaseVersion: releaseGateVersion,
          decision: releaseGateDecision,
          attesterName: releaseGateApproverName,
          attesterRole: releaseGateApproverRole,
          notes: releaseGateNotes,
          checklist: {
            rehearsalReviewed: true,
            releaseGateDraftReviewed: true,
            verificationEvidenceReviewed: releaseGateVerificationStatus === "passed",
            rollbackOwnerConfirmed: true,
            platformOwnerDecisionReviewed: true
          }
        })
      });
      const payload = await response.json() as { attestation?: EnterpriseGoLiveAttestation; error?: string };
      if (!response.ok) throw new Error(payload.error || "Go-live attestation failed.");
      setEnterpriseMessage(`Go-live attestation recorded: ${payload.attestation?.releaseVersion ?? releaseGateVersion} · ${payload.attestation?.decision ?? releaseGateDecision} · go-live identity ${payload.attestation?.latestReleaseGateSnapshot?.identityProductionStatus ?? "missing"} · identity verifier ${payload.attestation?.latestReleaseGateSnapshot?.identitySubmissionVerifierIncomplete ?? "missing"} incomplete · identity rotation ${payload.attestation?.latestReleaseGateSnapshot?.identityRotationFreshness ?? "missing"} · identity cutover ${payload.attestation?.latestReleaseGateSnapshot?.identityCutoverChecklistStatus ?? "missing"} · cutover blockers ${payload.attestation?.latestReleaseGateSnapshot?.identityCutoverChecklistBlockingItems ?? "missing"} · identity handoff ${payload.attestation?.identityProductionHandoffSnapshot?.status ?? "missing"} · handoff blockers ${payload.attestation?.identityProductionHandoffSnapshot?.platformRequestPacket.summary.blockingRequests ?? "missing"} · blocked ${payload.attestation?.latestReleaseGateSnapshot?.identityReleaseGateBlocked ? "yes" : "no"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Go-live attestation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  async function exportEnterpriseGoLiveAttestationsJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/go-live-rehearsal?attestations=1${activeEnterpriseTeamId ? `&teamId=${encodeURIComponent(activeEnterpriseTeamId)}` : ""}`,
      "sena-enterprise-go-live-attestations.json",
      "Enterprise go-live attestations"
    );
  }

  async function exportEnterprisePlatformDecisionRegisterJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/platform-decisions${enterpriseTeamQuery()}`,
      "sena-enterprise-platform-decision-register.json",
      "Enterprise platform decision register"
    );
  }

  async function exportEnterpriseReleaseGateReviewsJson() {
    await exportEnterpriseJsonArtifact(
      `/api/sena/ops/release-gate${enterpriseTeamQuery()}`,
      "sena-enterprise-release-gate-reviews.json",
      "Enterprise release gate reviews"
    );
  }

  async function refreshEnterpriseProvisioningReadiness(options: { silent?: boolean } = {}) {
    if (!enterpriseContext?.user) {
      if (!options.silent) setEnterpriseMessage("Sign in before refreshing provisioning and SCIM readiness.");
      return null;
    }
    if (!options.silent) setEnterpriseBusy(true);
    try {
      const [deploymentResponse, identityResponse] = await Promise.all([
        fetch(`/api/sena/ops/deployment${enterpriseTeamQuery()}`),
        fetch(`/api/sena/ops/identity-production-evidence${enterpriseTeamQuery()}`)
      ]);
      const payload = await deploymentResponse.json() as Partial<EnterpriseOrganizationDeploymentPackage> & { error?: string };
      if (payload.schemaVersion !== "sena-enterprise-organization-deployment/v1") {
        throw new Error(payload.error || "Enterprise deployment package did not include provisioning readiness evidence.");
      }
      const identityPayload = await identityResponse.json() as Partial<EnterpriseIdentityProductionEvidenceDossier> & { error?: string };
      if (identityPayload.schemaVersion !== "sena-enterprise-identity-production-evidence/v1") {
        throw new Error(identityPayload.error || "Enterprise identity production evidence did not include a platform request packet.");
      }
      const deployment = payload as EnterpriseOrganizationDeploymentPackage;
      const identityEvidence = identityPayload as EnterpriseIdentityProductionEvidenceDossier;
      setEnterpriseDeploymentPackage(deployment);
      setEnterpriseIdentityProductionEvidence(identityEvidence);
      const endpointCount = deployment.serviceEndpoints.filter((endpoint) => endpoint.id === "provisioning" || endpoint.id.startsWith("scim-")).length;
      const envEntries = deployment.env.filter((entry) => entry.category === "provisioning" || entry.category === "identity");
      const configuredEnv = envEntries.filter((entry) => entry.configured).length;
      if (!options.silent) {
        setEnterpriseMessage(`Provisioning readiness ${deployment.status}: identity evidence ${deployment.summary.identityProductionStatus}, identity verifier ${deployment.summary.identitySubmissionVerifierIncomplete} incomplete, secret rotation ${deployment.summary.identityRotationFreshness}, ${identityEvidence.platformRequestPacket.summary.blockingRequests} identity request blockers, ${configuredEnv}/${envEntries.length} env configured, ${endpointCount} SCIM/provisioning endpoints, ${deployment.summary.openPlatformDecisions} open platform decisions.`);
      }
      return { deployment, identityEvidence };
    } catch (error) {
      if (!options.silent) setEnterpriseMessage(error instanceof Error ? error.message : "Provisioning readiness refresh failed.");
      return null;
    } finally {
      if (!options.silent) setEnterpriseBusy(false);
    }
  }

  function applyEnterpriseIdentityRequestToPlatformDecision(
    request: EnterpriseIdentityPlatformDecisionRequestPacket["requests"][number]
  ) {
    setPlatformDecisionId(request.decisionId as EnterprisePlatformDecisionId);
    setPlatformDecisionStatus("accepted");
    setPlatformDecisionAcceptBridge(true);
    setPlatformDecisionOwnerName("");
    setPlatformDecisionOwnerRole(request.submissionTemplate.ownerRolePlaceholder);
    setPlatformDecisionEnvironment(request.submissionTemplate.environmentPlaceholder);
    setPlatformDecisionEvidenceUrl("");
    setPlatformDecisionProductionEvidenceIds(request.submissionTemplate.productionEvidenceIds);
    setPlatformDecisionProductionEvidenceVerifiedAt("");
    setPlatformDecisionNotes(request.submissionTemplate.notesTemplate);
    setEnterpriseMessage(`Loaded ${request.decisionId} identity request into the platform decision form. Enter the named institution identity platform owner, then paste the institution-owned HTTPS evidence URL and production verified-at timestamp before recording.`);
  }

  async function exportEnterpriseOpsAlertsJson() {
    await exportEnterpriseJsonArtifact(
      "/api/sena/ops/alerts",
      "sena-enterprise-ops-alerts.json",
      "Enterprise ops alerts"
    );
  }

  async function deliverEnterpriseOpsAlertsFromWorkspace() {
    if (!enterpriseContext?.user) {
      setEnterpriseMessage("Sign in before delivering enterprise ops alerts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const response = await fetch("/api/sena/ops/alerts", {
        method: "POST",
        headers: await enterpriseJsonHeaders(),
        body: JSON.stringify({ action: "deliver" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise ops alert delivery failed.");
      setEnterpriseMessage(`Ops alert delivery ${payload.status ?? "checked"}: ${payload.alerts?.summary?.firing ?? 0} firing, ${payload.alerts?.summary?.critical ?? 0} critical.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise ops alert delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  function exportTemporalRuntimeTraceJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-temporal-runtime-trace.json",
      JSON.stringify(
        buildSenaTemporalRuntimeTrace(dataset, buildOptions, { generatedAt, timelineModel }),
        null,
        2
      ),
      "application/json"
    );
  }

  function buildCurrentReport() {
    const generatedAt = new Date().toISOString();
    return buildSenaReport(model, {
      title: reportTitle,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      sourceDataset: dataset,
      humanReview: {
        status: reviewStatus,
        reviewer,
        reviewedAt: generatedAt,
        interpretation,
        limitations,
        nextActions
      },
      codingReliability: {
        ...codingReliabilityReview,
        reviewedAt: generatedAt
      },
      dataGovernance: dataGovernanceReview
    });
  }

  function buildCurrentEvidenceLedger() {
    const generatedAt = new Date().toISOString();
    return buildSenaEvidenceLedger(model, {
      title: `${reportTitle} Evidence Ledger`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      evidenceLimit: 500,
      humanReview: {
        status: reviewStatus,
        reviewer,
        reviewedAt: generatedAt,
        interpretation,
        limitations,
        nextActions
      }
    });
  }

  function exportEvidenceLedgerJson() {
    downloadText(
      "sena-evidence-ledger.json",
      JSON.stringify(buildCurrentEvidenceLedger(), null, 2),
      "application/json"
    );
  }

  function exportDemoWalkthroughJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-demo-walkthrough.json",
      JSON.stringify(
        buildSenaDemoWalkthrough(model, {
          title: `${reportTitle} Demo Walkthrough`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          pilotReadinessAudit,
          temporalRuntimeTrace
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportDemoVerificationJson() {
    const generatedAt = new Date().toISOString();
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-demo-verification.json",
      JSON.stringify(demoVerification, null, 2),
      "application/json"
    );
  }

  function exportDemoVerificationCompatibilityJson() {
    const generatedAt = new Date().toISOString();
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-demo-verification-compatibility-audit.json",
      JSON.stringify(buildSenaDemoVerificationCompatibilityAudit(model, demoVerification), null, 2),
      "application/json"
    );
  }

  function exportProductionPageContractJson() {
    downloadText(
      "sena-production-page-contract.json",
      JSON.stringify(buildSenaProductionPageContract(), null, 2),
      "application/json"
    );
  }

  function exportDevelopmentPlanJson() {
    const generatedAt = new Date().toISOString();
    const demoWalkthrough = buildSenaDemoWalkthrough(model, {
      title: `${reportTitle} Demo Walkthrough`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace
    });
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-development-plan.json",
      JSON.stringify(
        buildSenaDevelopmentPlan(model, {
          title: `${reportTitle} Development Plan`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          pilotReadinessAudit,
          demoWalkthrough,
          demoVerification
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportPilotReadinessJson() {
    downloadText(
      "sena-pilot-readiness-audit.json",
      JSON.stringify(pilotReadinessAudit, null, 2),
      "application/json"
    );
  }

  function exportCodingReliabilityJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-coding-reliability-gate.json",
      JSON.stringify(
        buildSenaCodingReliabilityGate({
          generatedAt,
          codingReliability: {
            ...codingReliabilityReview,
            reviewedAt: generatedAt
          }
        }, generatedAt),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportReliabilityDashboardJson() {
    if (!latestReliabilityDashboard) {
      setEnterpriseMessage("Upload coder annotations before exporting a reliability dashboard.");
      return;
    }
    downloadText(
      "sena-coding-reliability-dashboard.json",
      JSON.stringify(latestReliabilityDashboard, null, 2),
      "application/json"
    );
  }

  function exportClaimReadinessJson() {
    downloadText(
      "sena-claim-readiness-gate.json",
      JSON.stringify(claimReadinessGate, null, 2),
      "application/json"
    );
  }

  function exportReviewPacketJson() {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-review-packet.json",
      JSON.stringify(
        buildSenaReviewPacket(model, {
          title: reportTitle,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          sourceDataset: dataset,
          temporalRuntimeTrace,
          evidenceLimit: 500,
          demoVerificationManualReviews: demoManualReviews,
          humanReview: {
            status: reviewStatus,
            reviewer,
            reviewedAt: generatedAt,
            interpretation,
            limitations,
            nextActions
          },
          codingReliability: {
            ...codingReliabilityReview,
            reviewedAt: generatedAt
          },
          dataGovernance: dataGovernanceReview
        }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportLocalValidationResultJson() {
    if (!latestValidationResult) {
      setEnterpriseMessage("Run a group-comparison validation before exporting validation evidence.");
      return;
    }
    downloadText(
      "sena-group-comparison-validation.json",
      JSON.stringify(localEnterpriseValidationResult ?? latestValidationResult, null, 2),
      "application/json"
    );
  }

  function exportValidationPreregistrationPlanJson() {
    if (!latestValidationPreregistrationPlan) {
      setEnterpriseMessage("Run or load a validation run with a preregistration plan before exporting the plan.");
      return;
    }
    downloadText(
      "sena-validation-preregistration-plan.json",
      JSON.stringify(latestValidationPreregistrationPlan, null, 2),
      "application/json"
    );
  }

  function exportReportJson() {
    downloadText(
      "sena-analysis-report.json",
      JSON.stringify(buildCurrentReport(), null, 2),
      "application/json"
    );
  }

  function exportReportMarkdown() {
    const report = buildCurrentReport();
    downloadText(
      "sena-analysis-report.md",
      buildSenaMarkdownReport(report),
      "text/markdown"
    );
  }

  return (
    <section data-theme="light" className="min-h-screen bg-[#e6eaee] text-slate-950">
      {isFusionPlotMaximized && (
        <FusionPlotMaximizedOverlay
          model={model}
          layout={layout}
          enaManifest={enaManifest}
          layers={layers}
          threshold={threshold}
          selectedId={selected?.id ?? selectedId}
	          onSelect={handleCanvasSelect}
          onClose={() => setIsFusionPlotMaximized(false)}
          activeWindowLabel={activeWindowLabel}
          activeTurnLabel={activeTurnLabel}
          alpha={alpha}
          beta={beta}
	          gamma={gamma}
	          zoom={fusionPlotZoom}
	          onZoomIn={zoomInFusionPlot}
	          onZoomOut={zoomOutFusionPlot}
	          onZoomReset={resetFusionPlotZoom}
	          revealedLabelIds={revealedNodeLabelIds}
	        />
      )}
      <div className="mx-auto min-h-screen overflow-hidden border border-slate-300/70 bg-[#e1e6ec] shadow-soft 2xl:max-w-[118rem]">
        <header className="grid min-h-11 gap-3 border-b-4 border-cyanGlow bg-[#1f1f1f] px-4 py-2 text-white lg:grid-cols-[18rem_1fr_auto] lg:items-center">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/18 bg-white/8 text-cyanGlow">
              <Sigma className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black leading-tight">SENA Analysis Studio</span>
              <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-slate-300">Social-Epistemic Nexus Analytics</span>
            </span>
          </Link>

          <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-slate-300 md:grid-cols-4">
            <div><span className="text-white">Window</span> {activeWindowLabel}</div>
            <div><span className="text-white">Turns</span> {activeTurnLabel}</div>
            <div><span className="text-white">Evidence refs</span> {totalEvidenceRefs}</div>
            <div><span className="text-white">Report</span> {reportReadyPercent}% ready</div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/" className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
              <Home className="h-4 w-4" /> Home
            </Link>
            <Link href="/workspace/ena" className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
              <Sigma className="h-4 w-4" /> jENA
            </Link>
            <label className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
              <Upload className="h-4 w-4" /> Upload
              <input data-testid="sena-upload-input" type="file" accept={senaEnterpriseImportFileAccept} multiple className="sr-only" onChange={handleContractUpload} />
            </label>
            <button onClick={exportReportMarkdown} className={buttonStyles({ size: "sm" })}>
              <Download className="h-4 w-4" /> Export report
            </button>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-3rem)] xl:grid-cols-[4rem_19rem_minmax(0,1fr)_25rem]">
          <WorkspaceRail active={workspaceRailMode} onChange={handleWorkspaceRailChange} />

          <aside data-testid="workspace-left-panel" className="order-2 grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 border-b border-slate-300/70 bg-white p-4 xl:order-none xl:border-b-0 xl:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black uppercase text-[#777]">{activeRailPanel.title}</div>
                <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{activeRailPanel.subtitle}</div>
              </div>
              <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">{activeRailPanel.badge}</span>
            </div>

            <div className={cn(workspaceRailMode !== "sets" && "hidden")}>
              <Panel id="workflow-data" title="Data Import" icon={Database} className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <MetricCell label="People" value={model.summary.people} testId="data-count-people" />
                <MetricCell label="Codes" value={model.summary.concepts} testId="data-count-codes" />
                <MetricCell label="Utterances" value={dataset.utterances.length} testId="data-count-utterances" />
                <MetricCell label="Segments" value={dataset.coded_segments.length} testId="data-count-segments" />
                <MetricCell label="Social ties" value={timelineModel.summary.socialEdges} testId="data-count-social-ties" />
                <MetricCell label="SNA density" value={formatNumber(timelineModel.summary.socialAnalysis.density)} />
                <MetricCell label="Reciprocity" value={formatNumber(timelineModel.summary.socialAnalysis.reciprocity)} />
                <MetricCell label="Communities" value={timelineModel.summary.socialAnalysis.communityCount} />
              </div>

              <div className="mt-4 grid gap-3">
                <PilotAssetsPanel isLoadingSample={isLoadingSample} onLoadSample={loadLessonStudySample} />

                <div className="flex flex-wrap gap-2">
                  <label className={buttonStyles({ variant: "secondary" })}>
                    <Upload className="h-4 w-4" /> Add data/transcripts
                    <input data-testid="sena-data-import-upload-input" type="file" accept={senaEnterpriseImportFileAccept} multiple className="sr-only" onChange={handleContractUpload} />
                  </label>
                  <button data-testid="export-contract-template" onClick={exportContractTemplate} className={buttonStyles({ variant: "secondary" })}>
                    <Download className="h-4 w-4" /> Contract template
                  </button>
                  <button data-testid="clear-sena-contract" onClick={clearContract} className={buttonStyles({ variant: "secondary" })}>
                    <Trash2 className="h-4 w-4" /> Clear
                  </button>
                </div>

                <div className="rounded-lg border border-cardBorder/35 bg-background/20 px-3 py-2 text-xs font-bold leading-5 text-muted">
                  CSV/JSON/XLSX tables, LMS/forum exports, TXT/MD transcript cleaning, and SRT/VTT subtitle transcripts.
                </div>

                <div className="rounded-lg border border-cardBorder/45 bg-background/30 p-3 text-sm font-semibold leading-6 text-muted">
                  {importMessage}
                </div>

                <div data-testid="enterprise-runtime-panel" className="grid gap-3 rounded-lg border border-cyanGlow/30 bg-cyanGlow/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-foreground">Enterprise runtime</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                        {enterpriseContext?.user
                          ? `${enterpriseContext.user.name} · ${enterpriseContext.teams[0]?.name ?? "SENA team"} · ${enterpriseContext.memberships[0]?.role ?? "member"}`
                          : "Sign in to use RBAC projects, server imports, reliability dashboards, and publication exports."}
                      </div>
                      <div data-testid="enterprise-claim-evidence-package" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                        sena-enterprise-claim-evidence-package/v1
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-expert-review-list/v1 · sena-enterprise-expert-review/v1
                        </span>
                        <button
                          type="button"
                          data-testid="enterprise-expert-review-dossier-export"
                          onClick={() => void exportEnterpriseExpertReviewDossierJson()}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className={buttonStyles({ variant: "secondary", size: "sm", className: "h-7 px-2 text-[0.65rem]" })}
                        >
                          <Download className="h-3.5 w-3.5" /> Expert review dossier
                        </button>
                      </div>
                      <div
                        data-testid="enterprise-validation-parity-evidence"
                        data-visual-role="enterprise-validation-parity-evidence"
                        className="mt-2 grid gap-1 rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1.5 text-[0.68rem] font-bold leading-4 text-muted"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-black uppercase tracking-[0.08em] text-cyanGlow">
                            sena-validation-parity-evidence/v1 · {latestEnterpriseValidationRun?.parityEvidence?.status ?? "pending"}
                          </div>
                          <button
                            type="button"
                            data-testid="enterprise-validation-parity-export"
                            onClick={exportEnterpriseValidationParityEvidenceJson}
                            disabled={!latestEnterpriseValidationRun?.parityEvidence}
                            className={buttonStyles({ variant: "secondary", size: "sm", className: "h-7 px-2 text-[0.65rem]" })}
                          >
                            <Download className="h-3.5 w-3.5" /> Export validation parity
                          </button>
                        </div>
                        <div data-testid="enterprise-validation-walkthrough-evidence" className="break-words">
                          parityEvidence.walkthrough: {latestEnterpriseValidationRun?.parityEvidence
                            ? `${latestEnterpriseValidationRun.parityEvidence.walkthrough.source} · ${latestEnterpriseValidationRun.parityEvidence.walkthrough.status}${latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash ? ` · sha256 ${latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash.slice(0, 12)}` : ""}`
                            : "pending project-linked analysis-run SHA-256"}
                        </div>
                        <div className="break-words">
                          parityEvidence.runtimeParity: {latestEnterpriseValidationRun?.parityEvidence
                            ? latestEnterpriseValidationRun.parityEvidence.runtimeParity.map((evidence) => `${evidence.id}:${evidence.status}`).join(" · ")
                            : "pending jENA/rENA and jSNA/R sna evidence"}
                        </div>
                        <div data-testid="enterprise-validation-inference-reference" className="break-words">
                          parityEvidence.inference.studySpecificInferenceReference: {latestEnterpriseValidationRun?.parityEvidence?.inference.studySpecificInferenceReference ?? "required-before-publication-claim"}
                        </div>
                        <div data-testid="enterprise-formal-inference-readiness" className="break-words">
                          formalInference: {latestEnterpriseValidationRun?.parityEvidence?.formalInference
                            ? `${latestEnterpriseValidationRun.parityEvidence.formalInference.schemaVersion} · ${latestEnterpriseValidationRun.parityEvidence.formalInference.status} · minGroupSize=${latestEnterpriseValidationRun.parityEvidence.formalInference.minGroupSize} · warnings=${latestEnterpriseValidationRun.parityEvidence.formalInference.warnings.length}`
                            : "sena-formal-inference-readiness/v1 · pending study-specific model evidence"}
                        </div>
                      </div>
                    </div>
                    {!enterpriseContext?.user && (
                      <div className="flex gap-2">
                        <Link href="/login" className={buttonStyles({ variant: "secondary", size: "sm" })}>Login</Link>
                        <Link href="/register" className={buttonStyles({ variant: "dark", size: "sm" })}>Register</Link>
                      </div>
                    )}
                  </div>
                  <div data-testid="local-validation-controls" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
                    <div className="text-xs font-black uppercase text-muted">Group-comparison validation</div>
                    <div className="grid gap-2">
                      <select
                        value={validationGroupField}
                        onChange={(event) => {
                          setValidationGroupField(event.currentTarget.value as "group" | "role");
                          setValidationGroupA("");
                          setValidationGroupB("");
                        }}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        <option value="group">Group</option>
                        <option value="role">Role</option>
                      </select>
                      <select
                        value={selectedValidationGroupA}
                        onChange={(event) => setValidationGroupA(event.currentTarget.value)}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        {validationGroupValues.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <select
                        value={selectedValidationGroupB}
                        onChange={(event) => setValidationGroupB(event.currentTarget.value)}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        {validationGroupValues.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <select
                        value={validationMetric}
                        onChange={(event) => setValidationMetric(event.currentTarget.value as SenaGroupComparisonMetric)}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        {enterpriseValidationMetrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
                      </select>
                      <button type="button" onClick={() => void runEnterpriseValidationComparison()} disabled={enterpriseBusy || validationGroupValues.length < 2} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <Sigma className="h-4 w-4" /> Run
                      </button>
                      <button
                        type="button"
                        data-testid="run-validation-suite"
                        onClick={() => void runEnterpriseValidationComparison("suite")}
                        disabled={enterpriseBusy || validationGroupValues.length < 2}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Sigma className="h-4 w-4" /> Run Holm suite
                      </button>
                      <button type="button" data-testid="export-local-validation-result" onClick={exportLocalValidationResultJson} disabled={!latestValidationResult} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <Download className="h-4 w-4" /> Export validation
                      </button>
                      <button type="button" data-testid="export-validation-preregistration-plan" onClick={exportValidationPreregistrationPlanJson} disabled={!latestValidationPreregistrationPlan} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <Download className="h-4 w-4" /> Export plan
                      </button>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      <input
                        value={validationPreregistrationNote}
                        onChange={(event) => setValidationPreregistrationNote(event.currentTarget.value)}
                        placeholder="Preregistration or protocol note"
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                      <input
                        value={validationMethodNote}
                        onChange={(event) => setValidationMethodNote(event.currentTarget.value)}
                        placeholder="Method note for reviewer"
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                      <input
                        data-testid="enterprise-validation-inference-reference-input"
                        value={validationStudySpecificInferenceReference}
                        onChange={(event) => setValidationStudySpecificInferenceReference(event.currentTarget.value)}
                        placeholder="Study-specific inferential model or preregistration reference"
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow lg:col-span-2"
                      />
                    </div>
                    {localEnterpriseValidationResult && (
                      <div data-testid="local-validation-result" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold leading-5 text-muted">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          <Sigma className="h-3.5 w-3.5" />
                          <span>{localEnterpriseValidationResult.schemaVersion}</span>
                          <span>{localEnterpriseValidationResult.result.schemaVersion}</span>
                        </div>
                        <div>
                          Local validation: {validationResultSummary(localEnterpriseValidationResult.result)}
                        </div>
                        {validationSuiteSummary(localEnterpriseValidationResult.result) && (
                          <div data-testid="local-validation-suite-summary" className="rounded-md border border-cyanGlow/25 bg-background/35 px-2 py-1 text-cyanGlow">
                            {validationSuiteSummary(localEnterpriseValidationResult.result)}
                          </div>
                        )}
                        <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                          Guardrail: {primaryGroupComparison(localEnterpriseValidationResult.result).guardrail}
                        </div>
                        {localEnterpriseValidationResult.preregistrationPlan && (
                          <div data-testid="local-validation-preregistration-plan" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                            Plan hash: {localEnterpriseValidationResult.preregistrationPlan.planHash.slice(0, 12)} · {localEnterpriseValidationResult.preregistrationPlan.schemaVersion}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
                    <select
                      value={activeEnterpriseProjectId}
                      onChange={(event) => {
                        const projectId = event.currentTarget.value;
                        setActiveEnterpriseProjectId(projectId);
                        void openEnterpriseProject(projectId);
                      }}
                      disabled={!enterpriseContext?.user || enterpriseBusy}
                      className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                    >
                      <option value="">Server projects ({enterpriseProjects.length})</option>
                      {enterpriseProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title} · {project.datasetCounts.people}P/{project.datasetCounts.codes}C · {project.activeWindowLabel}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void saveEnterpriseProject()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <Database className="h-4 w-4" /> {activeEnterpriseProjectId ? "Update server project" : "Save server project"}
                    </button>
                    <button type="button" onClick={() => void runEnterpriseAnalysis()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <Sigma className="h-4 w-4" /> Server analysis
                    </button>
                    <button type="button" onClick={() => void refreshEnterpriseState()} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <RotateCcw className="h-4 w-4" /> Refresh
                    </button>
                    <button
                      type="button"
                      data-testid="enterprise-import-cleaning-manifest-export"
                      onClick={exportEnterpriseCleaningManifestJson}
                      disabled={enterpriseBusy}
                      className={buttonStyles({ variant: "secondary", size: "sm" })}
                    >
                      <Download className="h-4 w-4" /> Export cleaning manifest
                    </button>
                  </div>
                  <div className="text-xs font-semibold leading-5 text-muted">{enterpriseMessage}</div>
                  <div data-testid="enterprise-governance-exports" data-visual-role="enterprise-governance-artifact-exports" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Governance exports</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          sena-enterprise-governance/v1 · sena-enterprise-audit-delivery/v1 · sena-enterprise-backup-delivery/v1 · sena-enterprise-database-sync/v1
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        data-testid="enterprise-governance-health-export"
                        onClick={() => void exportEnterpriseGovernanceHealthJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Health JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-security-export"
                        onClick={() => void exportEnterpriseSecurityPostureJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Security JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-audit-csv-export"
                        onClick={() => void exportEnterpriseAuditCsv()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <FileText className="h-4 w-4" /> Audit CSV
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-backup-export"
                        onClick={() => void exportEnterpriseBackupJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Database className="h-4 w-4" /> Backup JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-audit-delivery"
                        onClick={() => void deliverEnterpriseAuditLogFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Audit delivery
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-backup-delivery"
                        onClick={() => void deliverEnterpriseBackupFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Database className="h-4 w-4" /> Backup delivery
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-governance-database-sync"
                        onClick={() => void syncEnterpriseDatabaseFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <GitMerge className="h-4 w-4" /> Database sync
                      </button>
                    </div>
                  </div>
                  <div data-testid="enterprise-ops-exports" data-visual-role="enterprise-ops-artifact-exports" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Ops exports</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          status · readiness · deployment package · SaaS operations · go-live rehearsal · firing alerts · sena-enterprise-ops-alert-delivery/v1
                        </div>
                        <div data-testid="enterprise-saas-operations-readiness-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-saas-operations-readiness/v1
                        </div>
                        <div data-testid="enterprise-capability-audit-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-capability-audit/v1
                        </div>
                        <div data-testid="enterprise-identity-production-evidence-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-production-evidence/v1
                        </div>
                        <div data-testid="enterprise-identity-platform-decision-request-packet-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-platform-decision-request-packet/v1
                        </div>
                        <div data-testid="enterprise-identity-submission-verifier-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-submission-verifier/v1
                        </div>
                        <div data-testid="enterprise-identity-rotation-freshness-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-rotation-freshness/v1
                        </div>
                        <div data-testid="enterprise-identity-cutover-checklist-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-cutover-checklist/v1
                        </div>
                        <div data-testid="enterprise-go-live-rehearsal-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-go-live-rehearsal/v1
                        </div>
                        <div data-testid="enterprise-go-live-rollback-drill-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-go-live-rollback-drill/v1
                        </div>
                        <div data-testid="enterprise-go-live-monitor-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-go-live-monitor/v1
                        </div>
                        <div data-testid="enterprise-go-live-release-gate-draft-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-release-gate-draft/v1
                        </div>
                        <div data-testid="enterprise-go-live-attestation-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-go-live-attestation/v1
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        data-testid="enterprise-ops-status-export"
                        onClick={() => void exportEnterpriseOpsStatusJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Status JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-ops-readiness-export"
                        onClick={() => void exportEnterpriseOpsReadinessJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Readiness JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-ops-deployment-export"
                        onClick={() => void exportEnterpriseDeploymentPackageJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Database className="h-4 w-4" /> Deployment JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-capability-audit-export"
                        onClick={() => void exportEnterpriseCapabilityAuditJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <FileText className="h-4 w-4" /> Capability audit
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-identity-production-evidence-export"
                        onClick={() => void exportEnterpriseIdentityProductionEvidenceJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Identity evidence
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-saas-operations-readiness-export"
                        onClick={() => void exportEnterpriseSaasOperationsReadinessJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> SaaS ops JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-rehearsal-export"
                        onClick={() => void exportEnterpriseGoLiveRehearsalJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Go-live JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-rollback-drill-export"
                        onClick={() => void exportEnterpriseGoLiveRollbackDrillJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <AlertTriangle className="h-4 w-4" /> Rollback drill
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-monitor-export"
                        onClick={() => void exportEnterpriseGoLiveMonitorJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Monitor JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-rehearsal-apply-draft"
                        onClick={() => void applyEnterpriseGoLiveRehearsalDraft()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Apply draft
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-attestation-submit"
                        onClick={() => void submitEnterpriseGoLiveAttestation()}
                        disabled={!enterpriseContext?.user || enterpriseBusy || !activeEnterpriseTeamId || !releaseGateApproverName.trim() || !releaseGateNotes.trim()}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Attest
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-go-live-attestation-export"
                        onClick={() => void exportEnterpriseGoLiveAttestationsJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Download className="h-4 w-4" /> Attest JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-ops-release-gate-export"
                        onClick={() => void exportEnterpriseReleaseGateReviewsJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Release gate JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-ops-alerts-export"
                        onClick={() => void exportEnterpriseOpsAlertsJson()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <AlertTriangle className="h-4 w-4" /> Alerts JSON
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-ops-alert-delivery"
                        onClick={() => void deliverEnterpriseOpsAlertsFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Alert delivery
                      </button>
                    </div>
                  </div>
                  <div data-testid="enterprise-notification-center" data-visual-role="enterprise-notification-center" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Notifications</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseTeamState
                            ? `${unreadEnterpriseNotificationCount} unread · ${enterpriseNotifications.length} visible · sena-enterprise-notifications/v1`
                            : "Sign in to load in-app notifications and delivery evidence."}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="enterprise-notification-refresh"
                        onClick={() => void refreshEnterpriseTeamState()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <RotateCcw className="h-4 w-4" /> Notifications
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        data-testid="enterprise-notification-deliver"
                        onClick={() => void deliverEnterpriseNotifications()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Deliver webhook
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-notification-deliver-email"
                        onClick={() => void deliverEnterpriseEmailsFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <FileText className="h-4 w-4" /> Deliver email
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {enterpriseNotifications.length === 0 && (
                        <div className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div>No visible notifications loaded.</div>
                          <button data-testid="enterprise-notification-mark-read" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            <CheckCircle2 className="h-4 w-4" /> Mark read
                          </button>
                        </div>
                      )}
                      {enterpriseNotifications.slice(0, 4).map((notification) => (
                        <div key={notification.id} className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-black text-foreground">
                              {notification.title} · {notification.status}
                            </div>
                            <div className="truncate">
                              {notification.kind} · {new Date(notification.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            data-testid="enterprise-notification-mark-read"
                            type="button"
                            onClick={() => void markEnterpriseNotificationReadFromWorkspace(notification.id)}
                            disabled={enterpriseBusy || notification.status === "read"}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                          >
                            <CheckCircle2 className="h-4 w-4" /> {notification.status === "read" ? "Read" : "Mark read"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div data-testid="enterprise-upload-storage" data-visual-role="enterprise-upload-storage-registry" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Upload storage</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseUploadVerification
                            ? `${enterpriseUploadVerification.status} · ${enterpriseUploadVerification.summary.verifiedBlobs}/${enterpriseUploadVerification.summary.registeredUploads} verified · ${enterpriseUploadVerification.summary.missingBlobs} missing · ${enterpriseUploadVerification.summary.checksumMismatches} corrupt`
                            : enterpriseUploadStorage
                              ? `${enterpriseUploads.length} upload${enterpriseUploads.length === 1 ? "" : "s"} registered · sena-upload-list/v1`
                              : "Sign in to load upload registry and blob integrity evidence."}
                        </div>
                      </div>
                      <label className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <Upload className="h-4 w-4" /> Add files
                        <input
                          data-testid="enterprise-upload-storage-file-input"
                          type="file"
                          multiple
                          accept={senaEnterpriseImportFileAccept}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className="sr-only"
                          onChange={createEnterpriseUploadRegistryFiles}
                        />
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        data-testid="enterprise-upload-storage-refresh"
                        onClick={() => void refreshEnterpriseUploadStorage({ verify: false })}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <RotateCcw className="h-4 w-4" /> Registry
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-upload-storage-verify"
                        onClick={() => void refreshEnterpriseUploadStorage({ verify: true })}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Verify blobs
                      </button>
                      <button
                        type="button"
                        data-testid="enterprise-upload-storage-deliver"
                        onClick={() => void deliverEnterpriseUploadObjectStorage(latestEnterpriseUpload?.id)}
                        disabled={!enterpriseContext?.user || enterpriseBusy || !latestEnterpriseUpload}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Database className="h-4 w-4" /> Deliver latest
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {!latestEnterpriseUpload && (
                        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                          No upload registry records loaded.
                        </div>
                      )}
                      {enterpriseUploads.slice(0, 3).map((upload) => (
                        <div key={upload.id} className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                          <div className="truncate font-black text-foreground">
                            {upload.originalName} · {upload.scanStatus} · {Math.round(upload.size / 1024)} KB
                          </div>
                          <div className="truncate">
                            {upload.contentType} · sha256 {upload.sha256.slice(0, 12)} · {new Date(upload.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div data-visual-role="enterprise-collaboration-pubsub-bridge" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Collaboration pub/sub</div>
                        <div data-testid="enterprise-collaboration-pubsub-schema" className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseCollaboration
                            ? `${enterpriseCollaboration.presence.length} presence · ${enterpriseCollaboration.comments.length} comments · ${enterpriseCollaboration.adjudications.length} adjudications · sena-enterprise-collaboration-pubsub-delivery/v1`
                            : `Project event bridge · ${enterpriseCollaborationTransport} · sena-enterprise-collaboration-pubsub-delivery/v1`}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="enterprise-collaboration-pubsub-delivery"
                        onClick={() => void deliverEnterpriseCollaborationPubSubFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy || !activeEnterpriseProjectId}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <Activity className="h-4 w-4" /> Deliver events
                      </button>
                    </div>
                  </div>
                  <div data-testid="enterprise-sso-preflight" data-visual-role="enterprise-sso-preflight" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">SSO preflight</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseSsoPreflight
                            ? `${enterpriseSsoPreflight.summary.checked} checked · ${enterpriseSsoPreflight.summary.passed} passed · ${enterpriseSsoPreflight.summary.review} review · sena-enterprise-sso-preflight/v1`
                            : "OAuth/OIDC provider readiness · sena-enterprise-sso-preflight/v1"}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="enterprise-sso-preflight-run"
                        onClick={() => void runEnterpriseSsoPreflightFromWorkspace()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Run preflight
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {enterpriseSsoProviderOptions.map((option) => {
                        const preflight = enterpriseSsoPreflight?.providers.find((provider) => provider.provider === option.value);
                        const passedChecks = preflight?.checks.filter((check) => check.status === "pass").length ?? 0;
                        const reviewChecks = preflight?.checks.filter((check) => check.status === "review").length ?? 0;
                        const checkCount = preflight?.checks.length ?? 0;
                        const missingEvidence = preflight?.checks.flatMap((check) => check.evidence).find((entry) => entry.startsWith("missing="));
                        return (
                          <div key={option.value} data-testid="enterprise-sso-preflight-provider" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-black text-foreground">{option.label}</span>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", preflight?.status === "pass" ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-700")}>
                                {preflight?.status ?? "pending"}
                              </span>
                            </div>
                            <div className="truncate">
                              {preflight ? `${preflight.mode} · ${preflight.configured ? "configured" : "missing env"}` : "Not checked in this session"}
                            </div>
                            <div className="truncate">
                              Checks {passedChecks}/{checkCount} pass · review {reviewChecks}
                            </div>
                            <div className="truncate">
                              Callback hash {preflight?.endpointHashes.callback?.slice(0, 12) ?? "pending"}
                            </div>
                            <div className="truncate">
                              {missingEvidence ?? (preflight ? "missing=none" : "Run preflight to record evidence")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div data-testid="enterprise-provisioning-readiness" data-visual-role="enterprise-provisioning-scim-readiness" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Provisioning / SCIM</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseDeploymentPackage
                            ? `${enterpriseDeploymentPackage.status} · identity ${enterpriseDeploymentPackage.summary.identityProductionStatus} · verifier ${enterpriseDeploymentPackage.summary.identitySubmissionVerifierIncomplete} incomplete · rotation ${enterpriseDeploymentPackage.summary.identityRotationFreshness} · handoff ${identityProductionHandoff ? `${identityProductionHandoff.platformRequestPacket.summary.blockingRequests} blockers / ${identityProductionHandoff.evidenceManifest.missingEvidenceIds.length} missing · action ${identityProductionHandoff.institutionActionPlan.summary.blockingLanes} lane blockers` : "pending"} · ${provisioningDeploymentEnv.filter((entry) => entry.configured).length}/${provisioningDeploymentEnv.length} env · ${provisioningServiceEndpoints.length + (identityProductionServiceEndpoint ? 1 : 0)} endpoints · sena-enterprise-organization-deployment/v1`
                            : "Institution lifecycle bridge · sena-enterprise-organization-deployment/v1"}
                        </div>
                        <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-provisioning/v1 · sena-scim-provisioning-bridge/v1 · sena-enterprise-identity-production-evidence/v1
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="enterprise-provisioning-readiness-refresh"
                        onClick={() => void refreshEnterpriseProvisioningReadiness()}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <RotateCcw className="h-4 w-4" /> Provisioning
                      </button>
                    </div>
                    {platformRequestPacket && (
                      <div data-testid="enterprise-identity-request-packet-summary" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold leading-5 text-muted">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black uppercase text-foreground">Identity request packet</span>
                          <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                            {platformRequestPacket.schemaVersion}
                          </span>
                        </div>
                        <div>
                          {platformRequestPacket.submission.method} {platformRequestPacket.submission.path} · {platformRequestPacket.summary.blockingRequests} blocking · {platformRequestPacket.summary.missingProductionEvidence} missing evidence · {platformRequestPacket.summary.missingTechnicalPrerequisites} technical · {platformRequestPacket.summary.receiptReviewRequests} receipt review
                        </div>
                        <div className="truncate">
                          Body {platformRequestPacket.submission.requiredBodyFields.join(", ")}
                        </div>
                        <div className="truncate">
                          Identity evidence fields {platformRequestPacket.submission.identityProductionEvidenceBodyFields.join(", ")}
                        </div>
                        <div data-testid="enterprise-identity-request-policy-binding" className="truncate">
                          Request policy {platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyHash="))?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing"} · {platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing"}
                        </div>
                        <div data-testid="enterprise-identity-submission-verifier-policy-binding" className="truncate">
                          Verifier policy {identityProductionHandoff?.submissionVerifier.evidence.find((entry) => entry.startsWith("requestPacketPolicyHash="))?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing"} · {identityProductionHandoff?.submissionVerifier.evidence.find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing"}
                        </div>
                        <div data-testid="enterprise-identity-request-evidence-url-policy" className="truncate">
                          Evidence URL {platformRequestPacket.submission.evidenceUrlPolicy.requiredProtocol} · required IDs {platformRequestPacket.submission.evidenceUrlPolicy.evidenceUrlRequiredForEvidenceIds.length} · allowed hosts {platformRequestPacket.submission.evidenceUrlPolicy.allowedHostConfigStatus ?? "not-configured"} ({platformRequestPacket.submission.evidenceUrlPolicy.allowedHostCount ?? 0}, invalid {platformRequestPacket.submission.evidenceUrlPolicy.invalidAllowedHostCount ?? 0}) · app origin {platformRequestPacket.submission.evidenceUrlPolicy.senaAppOriginConfigured ? "bound" : "missing"}
                        </div>
                        <div data-testid="enterprise-identity-request-evidence-url-secret-carriers" className="truncate">
                          Evidence URL secret carriers {platformRequestPacket.submission.evidenceUrlPolicy.embeddedCredentialsRejected ? "embedded credentials rejected" : "embedded credentials allowed"} · {platformRequestPacket.submission.evidenceUrlPolicy.fragmentsRejected ? "fragments rejected" : "fragments allowed"} · {platformRequestPacket.submission.evidenceUrlPolicy.sensitiveQueryParametersRejected ? "sensitive query rejected" : "sensitive query allowed"} · rejected query {platformRequestPacket.submission.evidenceUrlPolicy.rejectedSensitiveQueryParameters.join(", ") || "none"}
                        </div>
                        <div data-testid="enterprise-identity-request-secret-policy" className="truncate">
                          Submission secrets {platformRequestPacket.submission.notesPolicy.secretValuesRejected ? "raw secrets rejected" : "raw secrets allowed"} · {platformRequestPacket.submission.notesPolicy.bearerTokensRejected ? "bearer tokens rejected" : "bearer tokens allowed"} · fields {platformRequestPacket.submission.freeTextPolicy.fields.join(", ")} · sensitive names {platformRequestPacket.submission.notesPolicy.rejectedSensitiveAssignmentNames.length}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {platformRequestPacket.requests.map((request) => (
                            <div key={request.decisionId} data-testid="enterprise-identity-request-packet-decision" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-black text-foreground">{request.label}</span>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", request.blocking ? "border-amber-400/45 bg-amber-400/10 text-amber-800" : "border-emerald-400/45 bg-emerald-400/10 text-emerald-700")}>
                                    {request.blocking ? "blocking" : "ready"}
                                  </span>
                                  <button
                                    type="button"
                                    data-testid="enterprise-identity-request-apply"
                                    onClick={() => applyEnterpriseIdentityRequestToPlatformDecision(request)}
                                    disabled={!enterpriseContext?.user || enterpriseBusy}
                                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                                  >
                                    <ShieldCheck className="h-4 w-4" /> Apply
                                  </button>
                                </div>
                              </div>
                              <div className="truncate">
                                {request.decisionId} · evidence {request.submissionTemplate.productionEvidenceIds.join(", ") || "none"} · verifiedAt {request.submissionTemplate.productionEvidenceVerifiedAtField}
                              </div>
                              <div className="truncate">
                                owner {request.submissionTemplate.ownerNamePolicy.specificInstitutionOwnerRequired ? "named institution owner required" : request.submissionTemplate.ownerNamePlaceholder} · placeholder {request.submissionTemplate.ownerNamePolicy.genericPlaceholderRejected ? "rejected" : "allowed"}
                              </div>
                              <div data-testid="enterprise-identity-request-owner-role-policy" className="truncate">
                                role policy forbid {platformRequestPacket.submission.ownerRolePolicy.forbiddenTokens.join(", ") || "none"} · institution {platformRequestPacket.submission.ownerRolePolicy.institutionOwnerTokens.join(", ")} · decision tokens {platformRequestPacket.submission.ownerRolePolicy.requiredSemanticTokensByDecision[request.decisionId].join(", ")}
                              </div>
                              <div className="truncate">
                                verifiedAt {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.validPastOrPresentRequired ? "past/current required" : "optional"} · {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.canonicalIsoTimestampRequired ? "canonical ISO required" : "noncanonical allowed"} · future {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.futureTimestampsRejected ? "rejected" : "allowed"}
                              </div>
                              <div className="truncate">
                                rotation {request.submissionTemplate.rotationFreshnessPolicy.rotationEvidenceIds.join(", ") || "none"} · max {request.submissionTemplate.rotationFreshnessPolicy.maxAgeDays}d · warn {request.submissionTemplate.rotationFreshnessPolicy.warningDays}d
                              </div>
                              <div className="truncate">
                                missing {request.missingProductionEvidenceIds.length} · technical {request.missingTechnicalPrerequisiteEvidenceIds.length} · receipt {request.latestReceiptVerifierStatus ?? "pending"} · host {request.latestReceiptEvidenceUrlHostBindingStatus ?? "pending"}
                              </div>
                              <div data-testid="enterprise-identity-request-host-binding" className="truncate">
                                evidence host binding {request.latestReceiptEvidenceUrlHostBindingStatus ?? "pending"} · receipt {request.latestReceiptVerifierStatus ?? "pending"}
                              </div>
                              <div data-testid="enterprise-identity-request-receipt-policy-binding" className="truncate">
                                request policy binding {request.latestReceiptRequestPacketPolicyBindingStatus ?? "pending"} · receipt {request.latestReceiptVerifierStatus ?? "pending"}
                              </div>
                              <div data-testid="enterprise-identity-request-rotation-receipt" className="truncate">
                                receipt rotation {request.latestReceiptRotationFreshnessStatus ?? "pending"} · expired {(request.latestReceiptRotationExpiredEvidenceIds ?? []).join(", ") || "none"} · due soon {(request.latestReceiptRotationDueSoonEvidenceIds ?? []).join(", ") || "none"}
                              </div>
                              <div data-testid="enterprise-identity-request-next-actions" className="truncate">
                                next {request.nextActions.join(" · ")}
                              </div>
                              <div data-testid="enterprise-identity-request-acceptance-criteria" className="truncate">
                                criteria {request.acceptanceCriteria.join(" · ")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {institutionActionPlan && (
                      <div data-testid="enterprise-identity-institution-action-plan" className="grid gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 p-2 text-xs font-semibold leading-5 text-muted">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black uppercase text-foreground">Institution action plan</span>
                          <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-violet-700">
                            {institutionActionPlan.schemaVersion}
                          </span>
                        </div>
                        <div>
                          {institutionActionPlan.status} · {institutionActionPlan.summary.blockingLanes}/{institutionActionPlan.summary.lanes} blocking lanes · {institutionActionPlan.summary.missingProductionEvidence} missing evidence · {institutionActionPlan.summary.missingTechnicalPrerequisites} technical · digest {institutionActionPlan.digest?.slice(0, 12) ?? "missing"}
                        </div>
                        <div data-testid="enterprise-identity-action-plan-redaction" className="truncate">
                          redaction secrets {institutionActionPlan.redaction.secretValuesExcluded ? "excluded" : "included"} · evidence URLs {institutionActionPlan.redaction.evidenceUrlValuesExcluded ? "field only" : "included"} · owner names {institutionActionPlan.redaction.ownerNamesExcluded ? "excluded" : "included"} · evidence field {institutionActionPlan.redaction.submissionDraftEvidenceUrlFieldOnly ? "evidenceUrlField" : "evidenceUrl"}
                        </div>
                        <div data-testid="enterprise-identity-action-plan-archive" className="truncate">
                          archive path {institutionActionPlan.summary.submissionPath} · receipt body paths {institutionActionPlan.lanes[0]?.receiptArchiveBodyPaths.join(", ") ?? "missing"}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {institutionActionPlan.lanes.map((lane) => (
                            <div key={lane.id} data-testid="enterprise-identity-institution-action-plan-lane" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-black text-foreground">{lane.ownerRole}</span>
                                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", lane.blocking ? "border-amber-400/45 bg-amber-400/10 text-amber-800" : "border-emerald-400/45 bg-emerald-400/10 text-emerald-700")}>
                                  {lane.status}
                                </span>
                              </div>
                              <div className="truncate">
                                {lane.id} · decisions {lane.decisionIds.join(", ")} · drafts {lane.submissionDrafts.length}
                              </div>
                              <div className="truncate">
                                missing {lane.missingProductionEvidenceIds.join(", ") || "none"}
                              </div>
                              <div className="truncate">
                                technical {lane.missingTechnicalPrerequisiteEvidenceIds.join(", ") || "none"} · rotation {lane.rotationEvidenceIds.join(", ") || "none"}
                              </div>
                              <div className="truncate">
                                archive {lane.receiptArchiveStatuses.join(", ") || "pending"} · artifact {lane.artifactCompletenessStatuses.join(", ") || "pending"}
                              </div>
                              <div className="truncate">
                                headers {lane.responseAuditHeaders.slice(0, 3).join(", ")} · paths {lane.receiptArchiveBodyPaths.join(", ")}
                              </div>
                              <div className="line-clamp-2">
                                next {lane.nextActions.join(" · ")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {identityCutoverChecklist && (
                      <div data-testid="enterprise-identity-cutover-checklist" className="grid gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs font-semibold leading-5 text-muted">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black uppercase text-foreground">Identity cutover checklist</span>
                          <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-amber-700">
                            {identityCutoverChecklist.schemaVersion}
                          </span>
                        </div>
                        <div>
                          {identityCutoverChecklist.status} · {identityCutoverChecklist.summary.readyItems}/{identityCutoverChecklist.summary.items} ready · {identityCutoverChecklist.summary.blockingItems} blockers
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {identityCutoverChecklist.items.map((item) => (
                            <div key={item.id} data-testid="enterprise-identity-cutover-checklist-item" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-black text-foreground">{item.label}</span>
                                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", item.status === "ready" ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-800")}>
                                  {item.status}
                                </span>
                              </div>
                              <div className="truncate">
                                {item.id} · evidence {item.evidenceIds.join(", ")}
                              </div>
                              <div className="truncate">
                                missing {item.missingEvidenceIds.join(", ") || "none"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-2">
                      {(provisioningServiceEndpoints.length > 0 ? provisioningServiceEndpoints : [
                        { id: "provisioning", method: "POST" as const, path: "/api/sena/provisioning", auth: "provisioning-bearer", schema: "sena-enterprise-provisioning/v1", purpose: "Institution organization provisioning" },
                        { id: "scim-users", method: "POST" as const, path: "/api/sena/scim/v2/Users", auth: "provisioning-bearer", schema: "sena-scim-provisioning-bridge/v1", purpose: "SCIM user provisioning bridge" }
                      ]).slice(0, 3).map((endpoint) => (
                        <div key={endpoint.id} data-testid="enterprise-provisioning-endpoint" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-black text-foreground">
                              {endpoint.method} {endpoint.path}
                            </div>
                            <div className="truncate">
                              {endpoint.auth} · {endpoint.schema ?? "schema pending"} · {endpoint.purpose}
                            </div>
                          </div>
                          <span className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">
                            {endpoint.id}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(provisioningDeploymentEnv.length > 0 ? provisioningDeploymentEnv : [
                        { name: "SENA_PROVISIONING_TOKEN", category: "provisioning", required: false, configured: false, secret: true, status: "review" as const, purpose: "Bearer token for institution IdP/SCIM provisioning" },
                        { name: "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS", category: "identity", required: false, configured: false, secret: false, status: "review" as const, purpose: "Institution evidence-host allowlist for IdP/SCIM production evidence URLs" }
                      ]).map((entry) => (
                        <div key={entry.name} data-testid="enterprise-provisioning-env" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-black text-foreground">{entry.name}</span>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", entry.configured ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-700")}>
                              {entry.configured ? "configured" : "missing"}
                            </span>
                          </div>
                          <div className="truncate">
                            {entry.secret ? "secret excluded" : entry.valueHash ? `valueHash ${entry.valueHash.slice(0, 12)}` : "non-secret"}
                          </div>
                          <div className="truncate">{entry.purpose}</div>
                        </div>
                      ))}
                    </div>
                    <div data-testid="enterprise-provisioning-owner-decision" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-black text-foreground">
                          {provisioningOwnerDecision?.label ?? "Institution provisioning owner"}
                        </span>
                        <span className="rounded-full border border-cardBorder/40 bg-background/50 px-2 py-0.5 text-[0.65rem] font-black uppercase text-muted">
                          {provisioningOwnerDecision?.status ?? "open"}
                        </span>
                      </div>
                      <div className="truncate">
                        institution-provisioning-owner · {provisioningGovernanceCheck?.status ?? "review"} · register {enterpriseDeploymentPackage?.platformDecisionRegister.schemaVersion ?? "sena-enterprise-platform-decision-register/v1"}
                      </div>
                      <div className="line-clamp-2">
                        {provisioningOwnerDecision?.nextAction ?? "Assign the institution provisioning owner and configure SENA_PROVISIONING_TOKEN before claiming institution-managed lifecycle sync."}
                      </div>
                    </div>
                  </div>
                  <div data-testid="enterprise-account-security" data-visual-role="enterprise-auth-mfa-controls" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Account security</div>
                        <div data-testid="enterprise-mfa-status" className="mt-1 text-xs font-semibold leading-5 text-muted">
                          MFA {enterpriseMfaStatus?.enabled ? `enabled · ${enterpriseMfaStatus.method}` : enterpriseContext?.user ? "not enabled" : "available after sign-in"}
                          {enterpriseMfaStatus?.verifiedAt ? ` · verified ${new Date(enterpriseMfaStatus.verifiedAt).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button data-testid="enterprise-mfa-setup" type="button" onClick={() => void startEnterpriseMfaSetup()} disabled={!enterpriseContext?.user || enterpriseBusy || Boolean(enterpriseMfaStatus?.enabled)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <ShieldCheck className="h-4 w-4" /> Setup MFA
                        </button>
                        <button data-testid="enterprise-session-logout" type="button" onClick={() => void logoutEnterpriseSessionFromWorkspace()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </div>
                    {enterpriseMfaSetup && (
                      <div className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold text-muted">
                        <div className="font-black uppercase text-cyanGlow">Authenticator setup</div>
                        <div>Secret: <code className="break-all text-foreground">{enterpriseMfaSetup.secret}</code></div>
                        <div className="break-all">otpauth: <code>{enterpriseMfaSetup.otpauthUrl}</code></div>
                        <div>Expires: {new Date(enterpriseMfaSetup.expiresAt).toLocaleString()}</div>
                      </div>
                    )}
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_16rem_auto]">
                      <input
                        data-testid="enterprise-mfa-enable-code"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={enterpriseMfaEnableCode}
                        onChange={(event) => setEnterpriseMfaEnableCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Setup code"
                        disabled={!enterpriseContext?.user || enterpriseBusy || !enterpriseMfaSetup || Boolean(enterpriseMfaStatus?.enabled)}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <button type="button" onClick={() => void enableEnterpriseMfaFromSetup()} disabled={!enterpriseContext?.user || enterpriseBusy || !enterpriseMfaSetup || enterpriseMfaEnableCode.length !== 6 || Boolean(enterpriseMfaStatus?.enabled)} className={buttonStyles({ variant: "dark", size: "sm" })}>
                        <CheckCircle2 className="h-4 w-4" /> Enable
                      </button>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        data-testid="enterprise-mfa-disable-code"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={enterpriseMfaDisableCode}
                        onChange={(event) => setEnterpriseMfaDisableCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Current MFA code"
                        disabled={!enterpriseContext?.user || enterpriseBusy || !enterpriseMfaStatus?.enabled}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <button type="button" onClick={() => void disableEnterpriseMfaFromCode()} disabled={!enterpriseContext?.user || enterpriseBusy || !enterpriseMfaStatus?.enabled || enterpriseMfaDisableCode.length !== 6} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <X className="h-4 w-4" /> Disable
                      </button>
                    </div>
                    <div data-testid="enterprise-session-list" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-black uppercase text-muted">Sessions</div>
                          <div className="mt-1 text-xs font-semibold text-muted">
                            {enterpriseSessionList
                              ? `${enterpriseSessionList.sessions.length} active · ${enterpriseSessionList.sessionPolicy?.standardDays ?? enterpriseSessionList.sessionDays}d standard / ${enterpriseSessionList.sessionPolicy?.rememberedDays ?? enterpriseSessionList.sessionDays}d remembered`
                              : "Sign in to load active sessions."}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void refreshEnterpriseSessionList()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            <RotateCcw className="h-4 w-4" /> Sessions
                          </button>
                          <button data-testid="enterprise-session-revoke-others" type="button" onClick={() => void revokeEnterpriseSession(undefined, "revoke-others")} disabled={!enterpriseContext?.user || enterpriseBusy || (enterpriseSessionList?.sessions.filter((session) => !session.current).length ?? 0) === 0} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            <X className="h-4 w-4" /> Revoke others
                          </button>
                        </div>
                      </div>
                      {!enterpriseSessionList && (
                        <div data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div>No session list loaded.</div>
                          <button data-testid="enterprise-session-revoke" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            <X className="h-4 w-4" /> Revoke
                          </button>
                        </div>
                      )}
                      {enterpriseSessionList && enterpriseSessionList.sessions.length === 0 && (
                        <div data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div>No active sessions returned.</div>
                          <button data-testid="enterprise-session-revoke" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            <X className="h-4 w-4" /> Revoke
                          </button>
                        </div>
                      )}
                      {enterpriseSessionList?.sessions.slice(0, 4).map((session) => (
                        <div key={session.id} data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-black text-foreground">
                              {session.current ? "Current session" : "Active session"} · {session.id}
                            </div>
                            <div className="truncate">
                              {(session.sessionProfile ?? "standard")} · {session.ttlDays ?? enterpriseSessionList.sessionDays}d · Created {new Date(session.createdAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleString()}
                            </div>
                          </div>
                          <button data-testid="enterprise-session-revoke" type="button" onClick={() => void revokeEnterpriseSession(session.id)} disabled={enterpriseBusy || session.current} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            {session.current ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />} {session.current ? "Current" : "Revoke"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div data-testid="enterprise-team-operations" data-visual-role="enterprise-rbac-team-operations" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-black uppercase text-muted">Team operations</div>
                          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                            {enterpriseTeamState
                              ? `${enterpriseTeamMemberships.length} members · ${pendingEnterpriseInvitations.length} pending invites · ${enterpriseTeamState.auditLog.length} audit events`
                              : "Sign in to load team memberships, invitations, and audit events."}
                          </div>
                        </div>
                        <button type="button" onClick={() => void refreshEnterpriseTeamState()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <RotateCcw className="h-4 w-4" /> Team
                        </button>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_9rem_auto]">
                        <input
                          data-testid="enterprise-team-invite-email"
                          type="email"
                          value={teamInviteEmail}
                          onChange={(event) => setTeamInviteEmail(event.currentTarget.value)}
                          placeholder="invitee@university.edu"
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                        />
                        <select
                          value={teamInviteRole}
                          onChange={(event) => setTeamInviteRole(event.currentTarget.value as EnterpriseRole)}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                        >
                          {enterpriseRoleOptions.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        <button data-testid="enterprise-team-invite-submit" type="button" onClick={() => void createTeamInvitation()} disabled={!enterpriseContext?.user || !teamInviteEmail.trim() || enterpriseBusy} className={buttonStyles({ variant: "dark", size: "sm" })}>
                          <UsersRound className="h-4 w-4" /> Invite
                        </button>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          data-testid="enterprise-team-accept-code"
                          value={teamInviteCode}
                          onChange={(event) => setTeamInviteCode(event.currentTarget.value)}
                          placeholder="Paste invitation code"
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                        />
                        <button type="button" onClick={() => void acceptTeamInvitation()} disabled={!enterpriseContext?.user || !teamInviteCode.trim() || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <CheckCircle2 className="h-4 w-4" /> Accept invite
                        </button>
                      </div>
                      <div className="grid gap-2">
                        <div className="text-xs font-black uppercase text-muted">Members</div>
                        {!enterpriseTeamState && (
                          <div data-testid="enterprise-team-member-row" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
                            Sign in to load team memberships.
                          </div>
                        )}
                        {enterpriseTeamState && enterpriseTeamMemberships.length === 0 && (
                          <div data-testid="enterprise-team-member-row" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
                            No memberships loaded for this team.
                          </div>
                        )}
                        {enterpriseTeamMemberships.slice(0, 6).map((membership) => {
                          const user = enterpriseTeamUsersById.get(membership.userId);
                          const isSelf = membership.userId === enterpriseUserId;
                          const membershipRoleOptions: EnterpriseRole[] = membership.role === "owner" ? ["owner", ...enterpriseRoleOptions] : enterpriseRoleOptions;
                          return (
                            <div key={membership.id} data-testid="enterprise-team-member-row" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] lg:items-center">
                              <div className="min-w-0">
                                <div className="truncate font-black text-foreground">{user?.name ?? user?.email ?? membership.userId}</div>
                                <div className="truncate">{user?.email ?? membership.userId}</div>
                              </div>
                              <select
                                aria-label={`Role for ${user?.name ?? user?.email ?? membership.userId}`}
                                value={membership.role}
                                onChange={(event) => void updateTeamMembership(membership.id, { role: event.currentTarget.value as EnterpriseRole })}
                                disabled={enterpriseBusy || membership.role === "owner"}
                                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-bold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                              >
                                {membershipRoleOptions.map((role) => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                              <select
                                aria-label={`Status for ${user?.name ?? user?.email ?? membership.userId}`}
                                value={membership.status}
                                onChange={(event) => void updateTeamMembership(membership.id, { status: event.currentTarget.value as "active" | "suspended" })}
                                disabled={enterpriseBusy || membership.role === "owner"}
                                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-bold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                              >
                                <option value="active">active</option>
                                <option value="suspended">suspended</option>
                              </select>
                              <div className="whitespace-nowrap text-[11px] uppercase text-muted/80">
                                {isSelf ? "Current user" : new Date(membership.updatedAt).toLocaleDateString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid gap-2">
                        <div className="text-xs font-black uppercase text-muted">Pending invites</div>
                        {!enterpriseTeamState && (
                          <div data-testid="enterprise-team-pending-invite" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
                            Sign in to load pending invitations.
                          </div>
                        )}
                        {enterpriseTeamState && pendingEnterpriseInvitations.length === 0 && (
                          <div data-testid="enterprise-team-pending-invite" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
                            No pending invitations for this team.
                          </div>
                        )}
                          {pendingEnterpriseInvitations.slice(0, 4).map((invitation) => (
                            <div key={invitation.id} data-testid="enterprise-team-pending-invite" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                              <div className="min-w-0">
                                <div className="truncate font-black text-foreground">{invitation.email}</div>
                                <div className="truncate">{invitation.role} · {new Date(invitation.createdAt).toLocaleString()}</div>
                                <code className="mt-1 block break-all rounded border border-cardBorder/35 bg-background/55 px-2 py-1 text-[11px] text-muted">{invitation.inviteCode}</code>
                              </div>
                              <button type="button" onClick={() => void revokeTeamInvitation(invitation.id)} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                <X className="h-4 w-4" /> Revoke
                              </button>
                            </div>
                          ))}
                    </div>
                  </div>
                  <div data-testid="enterprise-platform-decision-review" data-visual-role="enterprise-platform-decision-review" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Platform decisions</div>
                        <div data-testid="enterprise-platform-decision-review-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-platform-decision-acceptance/v1
                        </div>
                        <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-native-adapter-certification/v1
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterprisePlatformDecisionState
                            ? `${enterprisePlatformDecisionState.summary.total} records · ${enterprisePlatformDecisionState.summary.acceptedBridge} accepted bridge · ${enterprisePlatformDecisionState.platformDecisionRegister?.summary.acceptedBridgeMissingEvidence ?? 0} missing evidence · ${enterprisePlatformDecisionState.platformDecisionRegister?.summary.productionBlocking ?? 0} blocking decisions`
                            : "Sign in as a team manager to load bridge and native-adapter decisions."}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void refreshEnterprisePlatformDecisionState()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <RotateCcw className="h-4 w-4" /> Decisions
                        </button>
                        <button
                          type="button"
                          data-testid="enterprise-platform-decision-register-export"
                          onClick={() => void exportEnterprisePlatformDecisionRegisterJson()}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          <Download className="h-4 w-4" /> Register JSON
                        </button>
                        <button
                          type="button"
                          data-testid="enterprise-native-adapter-certification-export"
                          onClick={() => void exportEnterpriseNativeAdapterCertificationJson()}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          <Download className="h-4 w-4" /> Native adapters
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_11rem_auto]">
                      <select
                        data-testid="enterprise-platform-decision-select"
                        value={platformDecisionId}
                        onChange={(event) => {
                          setPlatformDecisionId(event.currentTarget.value as EnterprisePlatformDecisionId);
                          setPlatformDecisionProductionEvidenceIds([]);
                        }}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      >
                        {enterprisePlatformDecisionOptions.map((decision) => (
                          <option key={decision.id} value={decision.id}>{decision.label}</option>
                        ))}
                      </select>
                      <select
                        data-testid="enterprise-platform-decision-status"
                        value={platformDecisionStatus}
                        onChange={(event) => setPlatformDecisionStatus(event.currentTarget.value as EnterprisePlatformDecisionStatus)}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      >
                        {enterprisePlatformDecisionStatuses.map((status) => (
                          <option key={status.value} value={status.value}>{status.label}</option>
                        ))}
                      </select>
                      <label className="flex h-10 items-center gap-2 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-black uppercase text-muted">
                        <input
                          type="checkbox"
                          checked={platformDecisionAcceptBridge}
                          onChange={(event) => setPlatformDecisionAcceptBridge(event.currentTarget.checked)}
                          disabled={!enterpriseContext?.user || enterpriseBusy || platformDecisionStatus !== "accepted"}
                          className="h-4 w-4 accent-cyanGlow"
                        />
                        Bridge
                      </label>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-3">
                      <input
                        data-testid="enterprise-platform-decision-owner"
                        value={platformDecisionOwnerName}
                        onChange={(event) => setPlatformDecisionOwnerName(event.currentTarget.value)}
                        placeholder="Named institution platform owner"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        value={platformDecisionOwnerRole}
                        onChange={(event) => setPlatformDecisionOwnerRole(event.currentTarget.value)}
                        placeholder="Owner role"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        value={platformDecisionEnvironment}
                        onChange={(event) => setPlatformDecisionEnvironment(event.currentTarget.value)}
                        placeholder="Environment"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        data-testid="enterprise-platform-decision-evidence"
                        value={platformDecisionEvidenceUrl}
                        onChange={(event) => setPlatformDecisionEvidenceUrl(event.currentTarget.value)}
                        placeholder="Institution HTTPS evidence URL"
                        required={platformDecisionRequiresIdentityEvidenceUrl}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        data-testid="enterprise-platform-decision-production-evidence-verified-at"
                        type="datetime-local"
                        aria-label="Production evidence verified at"
                        title="Institution production evidence verified-at timestamp"
                        required={platformDecisionRequiresIdentityEvidenceTimestamp}
                        value={platformDecisionProductionEvidenceVerifiedAt}
                        onChange={(event) => setPlatformDecisionProductionEvidenceVerifiedAt(event.currentTarget.value)}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <button
                        data-testid="enterprise-platform-decision-submit"
                        type="button"
                        onClick={() => void submitEnterprisePlatformDecisionReview()}
                        disabled={!enterpriseContext?.user || enterpriseBusy || !platformDecisionOwnerName.trim() || !platformDecisionNotes.trim()}
                        className={buttonStyles({ variant: "dark", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Record
                      </button>
                    </div>
                    <div data-testid="enterprise-platform-decision-production-evidence" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                      <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">Production evidence covered by this decision</div>
                      {selectedPlatformDecisionProductionEvidenceItems.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedPlatformDecisionProductionEvidenceItems.map((item) => {
                            const checked = platformDecisionProductionEvidenceIds.includes(item.id);
                            return (
                              <label key={item.id} className="flex min-w-0 items-start gap-2 rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 text-xs font-semibold leading-5 text-muted">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setPlatformDecisionProductionEvidenceIds((current) => event.currentTarget.checked
                                      ? Array.from(new Set([...current, item.id]))
                                      : current.filter((id) => id !== item.id));
                                  }}
                                  disabled={!enterpriseContext?.user || enterpriseBusy || platformDecisionStatus !== "accepted"}
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyanGlow"
                                />
                                <span className="min-w-0">{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 text-xs font-semibold leading-5 text-muted">
                          No production evidence checklist for this decision.
                        </div>
                      )}
                    </div>
                    <textarea
                      value={platformDecisionNotes}
                      onChange={(event) => setPlatformDecisionNotes(event.currentTarget.value)}
                      placeholder="Decision notes"
                      disabled={!enterpriseContext?.user || enterpriseBusy}
                      className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                    />
                    <div className="grid gap-2 text-xs font-semibold leading-5 text-muted">
                      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                        Selected: {selectedPlatformDecision ? `${selectedPlatformDecision.label} · ${selectedPlatformDecision.status} · accepted bridge ${selectedPlatformDecision.acceptedBridge ? "yes" : "no"}` : "Load decisions to inspect the current register."}
                      </div>
                      {selectedPlatformDecision?.evidenceChecklist?.length ? (
                        <div data-testid="enterprise-platform-decision-evidence-checklist" className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                          {selectedPlatformDecision.evidenceChecklist.map((item) => (
                            <div key={item.id} className="grid min-w-0 gap-1 rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                              <span className="min-w-0 truncate text-[0.72rem] font-black text-foreground">{item.label}</span>
                              <span className={cn(
                                "w-fit rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase",
                                item.status === "accepted" ? "bg-emerald-500/15 text-emerald-700" : item.status === "present" ? "bg-cyanGlow/15 text-cyanGlow" : "bg-amber-500/15 text-amber-800"
                              )}>
                                {item.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {latestPlatformDecisionAcceptance ? (
                        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                          Latest: {latestPlatformDecisionAcceptance.decisionId} · {latestPlatformDecisionAcceptance.status} · {latestPlatformDecisionAcceptance.ownerRole} · {new Date(latestPlatformDecisionAcceptance.updatedAt).toLocaleString()}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
                          No platform decision acceptance records loaded for this team.
                        </div>
                      )}
                    </div>
                  </div>
                  <div data-testid="enterprise-release-gate-review" data-visual-role="enterprise-release-gate-review" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase text-muted">Release gate</div>
                        <div data-testid="enterprise-release-gate-review-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-release-gate-review/v1
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                          {enterpriseReleaseGateState
                            ? `${enterpriseReleaseGateState.summary.total} review${enterpriseReleaseGateState.summary.total === 1 ? "" : "s"} · latest ${enterpriseReleaseGateState.summary.latestStatus ?? "none"}`
                            : "Record a release decision after readiness, platform decisions, and verification are reviewed."}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void refreshEnterpriseReleaseGateReviews()} disabled={!enterpriseContext?.user || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <RotateCcw className="h-4 w-4" /> Gate
                        </button>
                        <button
                          type="button"
                          data-testid="enterprise-release-gate-export"
                          onClick={() => void exportEnterpriseReleaseGateReviewsJson()}
                          disabled={!enterpriseContext?.user || enterpriseBusy}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          <Download className="h-4 w-4" /> Gate JSON
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <MetricCell label="Approved" value={enterpriseReleaseGateState?.summary.approved ?? 0} />
                      <MetricCell label="Conditional" value={enterpriseReleaseGateState?.summary.conditional ?? 0} />
                      <MetricCell label="Blocked" value={enterpriseReleaseGateState?.summary.blocked ?? 0} />
                      <MetricCell label="Platform blockers" value={latestReleaseGateReview?.platformDecisionSnapshot.productionBlocking ?? enterpriseDeploymentPackage?.platformDecisionRegister.summary.productionBlocking ?? 0} />
                      <MetricCell label="Identity missing" value={latestReleaseGateIdentitySnapshot?.missingEvidenceIds.length ?? 0} />
                    </div>
                    <div data-testid="enterprise-release-gate-identity-snapshot" className="grid gap-2 border-t border-cardBorder/35 pt-3 text-xs font-semibold leading-5 text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black uppercase text-foreground">Identity snapshot</span>
                        <span data-testid="enterprise-release-gate-identity-snapshot-schema" className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                          sena-enterprise-identity-production-evidence/v1
                        </span>
                        <span className={cn(
                          "rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase",
                          latestReleaseGateIdentitySnapshot?.status === "ready" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800"
                        )}>
                          {latestReleaseGateIdentitySnapshot?.status ?? "missing"}
                        </span>
                      </div>
                      <div>
                        Missing {latestReleaseGateIdentitySnapshot?.missingEvidenceIds.length ?? 0} · verifier missing {latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? 0} · rotation {latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"} · blocked {latestReleaseGateIdentitySnapshot?.releaseGateBlocked ? "yes" : "no"}
                      </div>
                      <div data-testid="enterprise-release-gate-identity-policy-binding" className="truncate">
                        Identity policy {latestReleaseGateIdentitySnapshot?.platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyHash="))?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing"} · {latestReleaseGateIdentitySnapshot?.platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing"}
                      </div>
                      <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">
                        sena-enterprise-identity-submission-verifier/v1 · sena-enterprise-identity-rotation-freshness/v1
                      </div>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <select
                        data-testid="enterprise-release-gate-decision"
                        value={releaseGateDecision}
                        onChange={(event) => setReleaseGateDecision(event.currentTarget.value as EnterpriseReleaseGateDecision)}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      >
                        {enterpriseReleaseGateDecisions.map((decision) => (
                          <option key={decision.value} value={decision.value}>{decision.label}</option>
                        ))}
                      </select>
                      <input
                        value={releaseGateVersion}
                        onChange={(event) => setReleaseGateVersion(event.currentTarget.value)}
                        placeholder="Release version"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        value={releaseGateEnvironment}
                        onChange={(event) => setReleaseGateEnvironment(event.currentTarget.value)}
                        placeholder="Environment"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                    </div>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input
                        value={releaseGateApproverName}
                        onChange={(event) => setReleaseGateApproverName(event.currentTarget.value)}
                        placeholder="Approver"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        value={releaseGateApproverRole}
                        onChange={(event) => setReleaseGateApproverRole(event.currentTarget.value)}
                        placeholder="Approver role"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <button
                        data-testid="enterprise-release-gate-submit"
                        type="button"
                        onClick={() => void submitEnterpriseReleaseGateReview()}
                        disabled={!enterpriseContext?.user || enterpriseBusy || !releaseGateApproverName.trim() || !releaseGateNotes.trim() || !releaseGateVerificationSummary.trim()}
                        className={buttonStyles({ variant: "dark", size: "sm" })}
                      >
                        <ShieldCheck className="h-4 w-4" /> Gate
                      </button>
                    </div>
                    <textarea
                      value={releaseGateNotes}
                      onChange={(event) => setReleaseGateNotes(event.currentTarget.value)}
                      placeholder="Release decision notes"
                      disabled={!enterpriseContext?.user || enterpriseBusy}
                      className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                    />
                    <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,0.65fr)]">
                      <select
                        data-testid="enterprise-release-gate-verification-status"
                        value={releaseGateVerificationStatus}
                        onChange={(event) => setReleaseGateVerificationStatus(event.currentTarget.value as EnterpriseReleaseVerificationStatus)}
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      >
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="not-run">Not run</option>
                      </select>
                      <textarea
                        data-testid="enterprise-release-gate-verification-summary"
                        value={releaseGateVerificationSummary}
                        onChange={(event) => setReleaseGateVerificationSummary(event.currentTarget.value)}
                        placeholder="Verification evidence summary"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                      <input
                        data-testid="enterprise-release-gate-verification-hash"
                        value={releaseGateVerificationHash}
                        onChange={(event) => setReleaseGateVerificationHash(event.currentTarget.value)}
                        placeholder="Optional verification output SHA-256"
                        disabled={!enterpriseContext?.user || enterpriseBusy}
                        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
                      />
                    </div>
                    <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold leading-5 text-muted">
                      {latestReleaseGateReview
                        ? `Latest: ${latestReleaseGateReview.releaseVersion} · ${latestReleaseGateReview.decision} · verification ${latestReleaseGateReview.verificationEvidence?.status ?? "missing"} · readiness ${latestReleaseGateReview.readinessSnapshot.blockingReview} blocking/${latestReleaseGateReview.readinessSnapshot.advisoryReview} advisory · platform ${latestReleaseGateReview.platformDecisionSnapshot.productionBlocking} blocking · ${new Date(latestReleaseGateReview.updatedAt).toLocaleString()}`
                        : "No release gate review records loaded for this team."}
                    </div>
                  </div>
                  {latestEnterpriseAnalysisRun && (
                    <div className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                      <div>
                        Latest analysis: {latestEnterpriseAnalysisRun.title} · {latestEnterpriseAnalysisRun.sourceKind} · {latestEnterpriseAnalysisRun.summary.people} people · {latestEnterpriseAnalysisRun.summary.concepts} codes · {latestEnterpriseAnalysisRun.summary.claimUse}
                      </div>
                      <div>
                        Fingerprints: report {latestEnterpriseAnalysisRun.artifactFingerprints.reportSha256.slice(0, 10)} · snapshot {latestEnterpriseAnalysisRun.artifactFingerprints.projectSnapshotSha256.slice(0, 10)}{latestEnterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256 ? ` · bundle ${latestEnterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256.slice(0, 10)}` : ""}
                      </div>
                    </div>
                  )}
                  {latestEnterpriseImportRun && (
                    <div className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                      <div>
                        Latest import: {latestEnterpriseImportRun.status} · {latestEnterpriseImportRun.fileCount} file{latestEnterpriseImportRun.fileCount === 1 ? "" : "s"} · {latestEnterpriseImportRun.datasetCounts.people} people · {latestEnterpriseImportRun.datasetCounts.utterances} utterances · {latestEnterpriseImportRun.warningCount} warnings
                      </div>
                      <div>
                        Profiles: {latestEnterpriseImportRun.sources.map((source) => `${source.profile}:${source.rows}`).join(", ")}
                      </div>
                      {latestEnterpriseImportRun.cleaningManifest && (
                        <div>
                          Cleaning: {latestEnterpriseImportRun.cleaningManifest.schemaVersion} · {latestEnterpriseImportRun.cleaningManifest.checks.filter((check) => check.status === "review").length} review check{latestEnterpriseImportRun.cleaningManifest.checks.filter((check) => check.status === "review").length === 1 ? "" : "s"} · placeholders {latestEnterpriseImportRun.cleaningManifest.summary.derivedPlaceholderCount} · skipped {latestEnterpriseImportRun.cleaningManifest.summary.skippedRowCount}
                        </div>
                      )}
                    </div>
                  )}
                  {activeEnterpriseProjectId && enterpriseCollaboration && (
                    <div className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
                        <MetricCell label="Version" value={enterpriseCollaboration.project.currentVersion} />
                        <MetricCell label="Presence" value={enterpriseCollaboration.presence.length} />
                        <MetricCell label="Open comments" value={enterpriseCollaboration.comments.filter((comment) => comment.status === "open").length} />
                        <MetricCell label="Adjudications" value={enterpriseCollaboration.adjudications.length} />
                        <MetricCell label="Reliability runs" value={enterpriseCollaboration.reliabilityRuns.length} />
                        <MetricCell label="Validation runs" value={enterpriseCollaboration.validationRuns.length} />
                        <MetricCell label="Expert reviews" value={enterpriseCollaboration.expertReviews.length} />
                      </div>
                      <div className="text-xs font-bold uppercase text-muted">
                        Live sync {enterpriseCollaborationTransport}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void touchEnterprisePresence()} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <UsersRound className="h-4 w-4" /> Sync presence
                        </button>
                        <button type="button" onClick={() => void refreshEnterpriseCollaboration()} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <RotateCcw className="h-4 w-4" /> Collaboration
                        </button>
                      </div>
                      {enterpriseCollaboration.revisions.length > 0 && (
                        <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
                          <div className="text-xs font-black uppercase text-muted">Revision history</div>
                          <div className="grid gap-2">
                            {enterpriseCollaboration.revisions.slice(0, 4).map((revision) => {
                              const isCurrentRevision = revision.version === enterpriseCollaboration.project.currentVersion;
                              return (
                                <div key={revision.id} className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[auto_1fr_auto] lg:items-center">
                                  <div className="font-black text-foreground">v{revision.version}</div>
                                  <div className="min-w-0">
                                    <div className="truncate">{revision.summary}</div>
                                    <div className="text-[11px] uppercase text-muted/80">
                                      {revision.user?.name ?? "SENA user"} · {new Date(revision.createdAt).toLocaleString()}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void restoreEnterpriseProjectRevision(revision.id)}
                                    disabled={enterpriseBusy || isCurrentRevision}
                                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                                  >
                                    <RotateCcw className="h-4 w-4" /> {isCurrentRevision ? "Current" : "Restore"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {enterpriseCollaboration.presence.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-xs font-bold text-muted">
                          {enterpriseCollaboration.presence.slice(0, 4).map((presence) => (
                            <span key={presence.id} className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1">
                              {presence.user?.name ?? "Collaborator"} · {presence.activeView}/{presence.cursorLabel}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="grid gap-2">
                        <label className="grid gap-1 text-xs font-bold text-muted">
                          Project comment
                          <textarea
                            value={enterpriseComment}
                            onChange={(event) => setEnterpriseComment(event.currentTarget.value)}
                            placeholder="Leave a reviewer/coder note on the selected node, edge, or whole project."
                            className="min-h-20 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
                          />
                        </label>
                        <button type="button" onClick={() => void addEnterpriseComment()} disabled={enterpriseBusy || !enterpriseComment.trim()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <PanelRight className="h-4 w-4" /> Add comment
                        </button>
                        {enterpriseCollaboration.comments[0] && (
                          <div className="rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                            Latest: {enterpriseCollaboration.comments[0].body} ({enterpriseCollaboration.comments[0].status})
                          </div>
                        )}
                        {latestEnterpriseReliabilityRun && (
                          <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                            <div>
                              Reliability: {latestEnterpriseReliabilityRun.reviewer} · {latestEnterpriseReliabilityRun.status} · kappa {latestEnterpriseReliabilityRun.meanPairwiseKappa} · alpha {latestEnterpriseReliabilityRun.krippendorffAlphaNominal}
                            </div>
                            {latestEnterpriseReliabilityRun.adjudicationCoverage && (
                              <div data-testid="enterprise-reliability-adjudication-coverage" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                Adjudication coverage: {Math.round(latestEnterpriseReliabilityRun.adjudicationCoverage.coverageRate * 100)}% · resolved {latestEnterpriseReliabilityRun.adjudicationCoverage.resolvedDisagreements}/{latestEnterpriseReliabilityRun.adjudicationCoverage.queuedDisagreements} · unresolved {latestEnterpriseReliabilityRun.adjudicationCoverage.unresolvedDisagreements}
                              </div>
                            )}
                            {latestEnterpriseReliabilityRun.dashboard?.codeDiagnostics?.[0] && (
                              <div data-testid="enterprise-reliability-code-diagnostics" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                Weakest code: {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].codeId} · disagreements {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].disagreementCount} · agreement {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].agreementRate}
                              </div>
                            )}
                            <input
                              value={reliabilityReviewNote}
                              onChange={(event) => setReliabilityReviewNote(event.currentTarget.value)}
                              placeholder="Reliability sign-off note"
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void reviewEnterpriseReliabilityRun("approved")} disabled={enterpriseBusy || Boolean(latestEnterpriseReliabilityRun.adjudicationCoverage?.unresolvedDisagreements)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                <CheckCircle2 className="h-4 w-4" /> Approve
                              </button>
                              <button type="button" onClick={() => void reviewEnterpriseReliabilityRun("rejected")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                <AlertTriangle className="h-4 w-4" /> Return
                              </button>
                            </div>
                          </div>
                        )}
                        {latestEnterpriseValidationRun && (
                          <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
                            <div className="text-xs font-black uppercase text-muted">Group-comparison validation</div>
                            <div className="grid gap-2 rounded-lg border border-cardBorder/25 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                              <div>
                                Validation: {latestEnterpriseValidationRun.status} · {latestEnterpriseValidationRun.metric} · {latestEnterpriseValidationRun.groupA} vs {latestEnterpriseValidationRun.groupB} · p={latestEnterpriseValidationRun.pTwoSided}
                              </div>
                              {latestEnterpriseValidationRun.result && validationSuiteSummary(latestEnterpriseValidationRun.result) && (
                                <div data-testid="enterprise-validation-suite-summary" className="rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1 text-cyanGlow">
                                  {validationSuiteSummary(latestEnterpriseValidationRun.result)}
                                </div>
                              )}
                              {latestEnterpriseValidationRun.preregistrationPlan && (
                                <div data-testid="enterprise-validation-preregistration-plan" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                  Plan hash: {latestEnterpriseValidationRun.preregistrationPlan.planHash.slice(0, 12)} · {latestEnterpriseValidationRun.preregistrationPlan.schemaVersion}
                                </div>
                              )}
                              {latestEnterpriseValidationRun.parityEvidence && (
                                <div
                                  data-testid="enterprise-validation-parity-evidence-detail"
                                  data-visual-role="enterprise-validation-parity-evidence-detail"
                                  className="grid gap-2 rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-2"
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyanGlow">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    <span>{latestEnterpriseValidationRun.parityEvidence.schemaVersion}</span>
                                    <span>{latestEnterpriseValidationRun.parityEvidence.status}</span>
                                    <span>hash {latestEnterpriseValidationRun.parityEvidence.validationRunHash.slice(0, 12)}</span>
                                  </div>
                                  <div
                                    data-testid="enterprise-validation-walkthrough-evidence-detail"
                                    className="rounded border border-cardBorder/30 bg-background/35 px-2 py-1"
                                  >
                                    parityEvidence.walkthrough: {latestEnterpriseValidationRun.parityEvidence.walkthrough.status} · {latestEnterpriseValidationRun.parityEvidence.walkthrough.source} · {latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetLabel}
                                    {latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash ? ` · sha256 ${latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash.slice(0, 12)}` : ""}
                                  </div>
                                  <div className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                                    parityEvidence.runtimeParity: {latestEnterpriseValidationRun.parityEvidence.runtimeParity.map((evidence) => `${evidence.id}:${evidence.status}`).join(" · ")}
                                  </div>
                                  <div className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                                    parityEvidence.inference.studySpecificInferenceReference: {latestEnterpriseValidationRun.parityEvidence.inference.studySpecificInferenceReference ?? "required-before-publication-claim"}
                                  </div>
                                  <div data-testid="enterprise-formal-inference-readiness-detail" className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                                    formalInference: {latestEnterpriseValidationRun.parityEvidence.formalInference
                                      ? `${latestEnterpriseValidationRun.parityEvidence.formalInference.schemaVersion} · ${latestEnterpriseValidationRun.parityEvidence.formalInference.status} · blockers=${latestEnterpriseValidationRun.parityEvidence.formalInference.blockers.length} · warnings=${latestEnterpriseValidationRun.parityEvidence.formalInference.warnings.length}`
                                      : "sena-formal-inference-readiness/v1 · pending"}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {latestEnterpriseValidationRun.parityEvidence.gates.map((gate) => (
                                      <span key={gate.id} className="rounded-full border border-cardBorder/30 bg-background/35 px-2 py-0.5 text-[11px] font-black uppercase text-muted">
                                        {gate.id}: {gate.status}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <input
                                value={validationReviewNote}
                                onChange={(event) => setValidationReviewNote(event.currentTarget.value)}
                                placeholder="Validation review note"
                                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void reviewEnterpriseValidationRun("approved")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                  <CheckCircle2 className="h-4 w-4" /> Approve validation
                                </button>
                                <button type="button" onClick={() => void reviewEnterpriseValidationRun("rejected")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                  <AlertTriangle className="h-4 w-4" /> Return validation
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-black uppercase text-muted">Domain expert review</div>
                              <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                                sena-expert-review-list/v1 · sena-enterprise-expert-review/v1
                              </div>
                            </div>
                            <button
                              type="button"
                              data-testid="enterprise-expert-review-dossier-export-project"
                              onClick={() => void exportEnterpriseExpertReviewDossierJson()}
                              disabled={!enterpriseContext?.user || enterpriseBusy}
                              className={buttonStyles({ variant: "secondary", size: "sm" })}
                            >
                              <Download className="h-4 w-4" /> Expert JSON
                            </button>
                          </div>
                          <div className="grid gap-2 lg:grid-cols-3">
                            <input
                              value={expertReviewerName}
                              onChange={(event) => setExpertReviewerName(event.currentTarget.value)}
                              placeholder="Reviewer name"
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            />
                            <input
                              value={expertExpertiseArea}
                              onChange={(event) => setExpertExpertiseArea(event.currentTarget.value)}
                              placeholder="Expertise area"
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            />
                            <select
                              value={expertClaimScope}
                              onChange={(event) => setExpertClaimScope(event.currentTarget.value as "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready")}
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            >
                              <option value="exploratory-only">Exploratory</option>
                              <option value="claim-ready-with-limits">Claim-ready with limits</option>
                              <option value="not-claim-ready">Not claim-ready</option>
                            </select>
                          </div>
                          <div className="grid gap-2 lg:grid-cols-3">
                            <label className="grid gap-1 text-xs font-bold text-muted">
                              Data
                              <input type="number" min={1} max={5} value={expertDataAdequacy} onChange={(event) => setExpertDataAdequacy(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
                            </label>
                            <label className="grid gap-1 text-xs font-bold text-muted">
                              Method
                              <input type="number" min={1} max={5} value={expertMethodFit} onChange={(event) => setExpertMethodFit(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
                            </label>
                            <label className="grid gap-1 text-xs font-bold text-muted">
                              Interpretation
                              <input type="number" min={1} max={5} value={expertInterpretationValidity} onChange={(event) => setExpertInterpretationValidity(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
                            </label>
                          </div>
                          <div className="grid gap-2 lg:grid-cols-2">
                            <input
                              value={expertConcerns}
                              onChange={(event) => setExpertConcerns(event.currentTarget.value)}
                              placeholder="Concerns"
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            />
                            <input
                              value={expertRecommendations}
                              onChange={(event) => setExpertRecommendations(event.currentTarget.value)}
                              placeholder="Recommendations"
                              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                            />
                          </div>
                          {latestEnterpriseExpertReview && (
                            <div className="rounded-lg border border-cardBorder/25 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
                              Expert: {latestEnterpriseExpertReview.status} · {latestEnterpriseExpertReview.claimScope} · data {latestEnterpriseExpertReview.ratings.dataAdequacy}/5 · method {latestEnterpriseExpertReview.ratings.methodFit}/5 · interpretation {latestEnterpriseExpertReview.ratings.interpretationValidity}/5
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void submitEnterpriseExpertReview("approved")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                              <CheckCircle2 className="h-4 w-4" /> Record expert approval
                            </button>
                            <button type="button" onClick={() => void submitEnterpriseExpertReview("changes-requested")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                              <AlertTriangle className="h-4 w-4" /> Request changes
                            </button>
                            {latestEnterpriseExpertReview && (
                              <button type="button" onClick={() => void updateEnterpriseExpertReview("rejected")} disabled={enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                                <X className="h-4 w-4" /> Reject latest
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          data-testid="enterprise-claim-evidence-package-details"
                          data-visual-role="enterprise-claim-evidence-package"
                          className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-black uppercase text-muted">Enterprise claim package</div>
                              <div className="text-xs font-semibold text-muted">sena-enterprise-claim-evidence-package/v1</div>
                            </div>
                            <button type="button" onClick={() => void refreshEnterpriseCollaboration()} disabled={!activeEnterpriseProjectId || enterpriseBusy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                              <ShieldCheck className="h-4 w-4" /> Refresh package
                            </button>
                          </div>
                          {enterpriseClaimPackage ? (
                            <div className="grid gap-2 text-xs font-semibold leading-5 text-muted">
                              <div className="grid gap-2 md:grid-cols-4">
                                <MetricCell label="Claim status" value={enterpriseClaimPackage.status} />
                                <MetricCell label="Blockers" value={enterpriseClaimPackage.summary.blockers} />
                                <MetricCell label="Warnings" value={enterpriseClaimPackage.summary.warnings} />
                                <MetricCell label="Artifacts" value={enterpriseClaimPackage.artifacts.length} />
                              </div>
                              <div className="grid gap-2 md:grid-cols-3">
                                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                  Reliability: {enterpriseClaimPackage.summary.reliability}
                                  {enterpriseClaimPackage.evidence.reliability ? ` · kappa ${enterpriseClaimPackage.evidence.reliability.meanPairwiseKappa} · alpha ${enterpriseClaimPackage.evidence.reliability.krippendorffAlphaNominal}` : ""}
                                </div>
                                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                  Validation: {enterpriseClaimPackage.summary.validation}
                                  {enterpriseClaimPackage.evidence.validation ? ` · ${enterpriseClaimPackage.evidence.validation.analysis} · comparisons ${enterpriseClaimPackage.evidence.validation.comparisonCount}` : ""}
                                  {enterpriseClaimPackage.evidence.validation?.preregistrationPlanHash ? ` · plan ${enterpriseClaimPackage.evidence.validation.preregistrationPlanHash.slice(0, 12)}` : ""}
                                  {enterpriseClaimPackage.evidence.validation?.parityEvidence ? ` · parity ${enterpriseClaimPackage.evidence.validation.parityEvidence.status} · ${enterpriseClaimPackage.evidence.validation.parityEvidence.validationRunHash.slice(0, 12)}` : ""}
                                </div>
                                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                  Expert: {enterpriseClaimPackage.summary.expertReview}
                                  {enterpriseClaimPackage.evidence.expertReview ? ` · ${enterpriseClaimPackage.evidence.expertReview.claimScope} · ${enterpriseClaimPackage.evidence.expertReview.reviewerName}` : ""}
                                </div>
                              </div>
                              <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                Source: project v{enterpriseClaimPackage.sourceSnapshotEvidence.projectVersion} · revision {enterpriseClaimPackage.sourceSnapshotEvidence.revisionMatchesCurrentVersion ? "matched" : "missing"} · snapshot {enterpriseClaimPackage.sourceSnapshotEvidence.snapshotSha256.slice(0, 12)} · report {enterpriseClaimPackage.sourceSnapshotEvidence.reportSha256.slice(0, 12)} · fingerprints {enterpriseClaimPackage.sourceSnapshotEvidence.matrixFingerprints.length}
                              </div>
                              {enterpriseClaimPackage.blockers.length > 0 && (
                                <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-100">
                                  Blockers: {enterpriseClaimPackage.blockers.join(", ")}
                                </div>
                              )}
                              <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                                Guardrail: {enterpriseClaimPackage.guardrails[0]}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-2 text-xs font-semibold text-muted">
                              Select or save a server project to assemble approved reliability, validation, preregistration, and expert-review evidence.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_8rem_1fr_auto]">
                        <input
                          value={adjudicationItemId}
                          onChange={(event) => setAdjudicationItemId(event.currentTarget.value)}
                          placeholder="item/segment id"
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
                        />
                        <input
                          value={adjudicationCodeId}
                          onChange={(event) => setAdjudicationCodeId(event.currentTarget.value)}
                          placeholder="code id"
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
                        />
                        <select
                          value={adjudicationDecision}
                          onChange={(event) => setAdjudicationDecision(event.currentTarget.value as "include" | "exclude" | "revise")}
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
                        >
                          <option value="include">Include</option>
                          <option value="exclude">Exclude</option>
                          <option value="revise">Revise</option>
                        </select>
                        <input
                          value={adjudicationNotesQuick}
                          onChange={(event) => setAdjudicationNotesQuick(event.currentTarget.value)}
                          placeholder="adjudication note"
                          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
                        />
                        <button type="button" onClick={() => void addEnterpriseAdjudication()} disabled={enterpriseBusy || !adjudicationItemId.trim() || !adjudicationCodeId.trim()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <CheckCircle2 className="h-4 w-4" /> Record
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <DataContractAuditPanel audit={sourceDataContractAudit} onExport={exportDataContractAuditJson} />

                {importError && (
                  <div className="rounded-lg border border-rose-300/35 bg-rose-300/10 p-3 text-sm font-semibold leading-6 text-rose-100">
                    {importError}
                  </div>
                )}

                {uploadedTables.length > 0 && (
                  <div className="grid max-h-[42rem] gap-3 overflow-auto pr-1">
                    {uploadedTables.map((table) => (
                      <UploadedTableMapper
                        key={table.id}
                        table={table}
                        onTableChange={(nextTable) => updateTableContract(table.id, nextTable)}
                        onFieldChange={(field, column) => updateTableField(table.id, field, column)}
                      />
                    ))}
                  </div>
                )}

                {timelineModel.summary.warnings.length > 0 && (
                  <div className="sena-warning-panel grid max-h-64 gap-2 overflow-auto rounded-lg p-3 text-xs font-semibold leading-5">
                    {timelineModel.summary.warnings.slice(0, 12).map((warning, index) => (
                      <div key={`${warning}-${index}`} className="flex gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                    {timelineModel.summary.warnings.length > 12 && <div>{timelineModel.summary.warnings.length - 12} more warnings.</div>}
                  </div>
                )}
              </div>
              </Panel>
            </div>

            <div className={cn(workspaceRailMode !== "model" && "hidden")}>
              <Panel id="workflow-model" title="Model Builder" icon={SlidersHorizontal} className="p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  {layoutOptions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        data-testid={`model-layout-${item.value}`}
                        onClick={() => setLayout(item.value)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                          layout === item.value ? "border-cyanGlow/60 bg-cyanGlow/12 text-foreground" : "border-cardBorder/45 bg-background/30 text-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>
                          <span className="block font-black">{item.label}</span>
                          <span className="block text-xs font-semibold">{item.note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-2">
                  {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => {
                    const Icon = layers[layer] ? Eye : EyeOff;
                    return (
	                      <button
	                        key={layer}
	                        type="button"
	                        data-testid={`model-layer-${layer}-toggle`}
	                        onClick={() => toggleLayer(layer)}
	                        className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-black", layerCopy[layer].className, !layers[layer] && "opacity-50")}
	                      >
                        <span>{layerCopy[layer].label}</span>
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>

                <Slider label="alpha - SNA" value={alpha} testId="alpha-slider" onChange={setAlpha} />
                <Slider label="beta - ENA" value={beta} testId="beta-slider" onChange={setBeta} />
                <Slider label="gamma - Bridge" value={gamma} testId="gamma-slider" onChange={setGamma} />
                <Slider label="Edge threshold" value={threshold} testId="edge-threshold-slider" onChange={setThreshold} />

                <label className="grid gap-2 text-sm font-black text-foreground">
                  Normalization
	                  <select
	                    data-testid="normalization-select"
	                    value={normalization}
	                    onChange={(event) => setNormalization(event.currentTarget.value as SenaNormalization)}
                    className="h-11 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
                  >
                    <option value="max">Max scaling</option>
                    <option value="log-max">Log + max scaling</option>
                    <option value="none">Raw weights</option>
                  </select>
                </label>
              </div>
              </Panel>
            </div>

            <div className={cn(workspaceRailMode !== "plots" && "hidden")}>
              <div className="grid gap-4">
                <Panel id="workspace-plot-tools-panel" title="Plot Tools" icon={Activity} className="p-4">
                  <div className="grid gap-4">
                    <WorkspaceToolSection
                      testId="plot-tools-dimensions-section"
                      title="Dimensions"
                      detail="Choose the coordinate frame used by the central plot."
                    >
                      {layoutOptions.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.value}
                            data-testid={`plot-layout-${item.value}`}
                            onClick={() => setLayout(item.value)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                              layout === item.value ? "border-cyanGlow/60 bg-cyanGlow/12 text-slate-950" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-950"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>
                              <span className="block text-sm font-black">{item.label}</span>
                              <span className="block text-xs font-semibold leading-5">{item.note}</span>
                            </span>
                          </button>
                        );
                      })}
                    </WorkspaceToolSection>

                    <WorkspaceToolSection
                      testId="plot-tools-plotted-points-section"
                      title="Plotted Points"
                      detail="Switch the active central plot without moving away from the workspace."
                    >
                      {plotViewOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          data-testid={`plot-tool-view-${option.id}`}
                          onClick={() => setActivePlotView(option.id)}
                          className={cn(
                            "rounded border px-3 py-2 text-left transition",
                            activePlotView === option.id
                              ? "border-cyanGlow/70 bg-cyanGlow/14 text-slate-950"
                              : "border-slate-200 bg-white text-slate-600 hover:border-cyanGlow/40 hover:text-slate-950"
                          )}
                        >
                          <span className="block text-sm font-black">{option.label}</span>
                          <span className="mt-0.5 block text-xs font-semibold leading-5">{option.detail}</span>
                        </button>
                      ))}
                    </WorkspaceToolSection>

                    <WorkspaceToolSection
                      testId="plot-tools-network-graph-section"
                      title="Network Graph"
                      detail="Tune visible S/W/B layers and minimum edge weight."
                    >
                      {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => {
                        const Icon = layers[layer] ? Eye : EyeOff;
                        return (
                          <button
                            key={layer}
                            type="button"
                            data-testid={`plot-layer-${layer}-toggle`}
                            onClick={() => toggleLayer(layer)}
                            className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-black", layerCopy[layer].className, !layers[layer] && "opacity-50")}
                          >
                            <span>{layerCopy[layer].label}</span>
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}

                      <Slider label="Edge threshold" value={threshold} testId="plot-edge-threshold-slider" onChange={setThreshold} />
                      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                        S/W/B line widths scale within each visible layer; the threshold filters low-salience graph ties before inspection.
                      </div>
                    </WorkspaceToolSection>

                    <WorkspaceToolSection
                      testId="plot-tools-temporal-framing-section"
                      title="Temporal Framing"
                      detail="Set the active window logic used by Fusion and Temporal views."
                    >
                    <div className="grid grid-cols-3 gap-2 rounded border border-slate-200 bg-white p-2">
                      {temporalModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          data-testid={`plot-temporal-mode-${option.value}`}
                          onClick={() => setTemporalMode(option.value)}
                          className={cn(
                            "rounded-md px-2 py-2 text-xs font-black transition",
                            temporalMode === option.value ? "bg-cyanGlow text-slate-950" : "text-slate-500 hover:bg-white hover:text-slate-950"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    </WorkspaceToolSection>

                    <WorkspaceSecondaryDrawer
                      testId="plot-tools-advanced-drawer"
                      visualRole="webena-plot-tools-advanced-drawer"
                      title="Advanced Options"
                      detail="Weights, normalization, and line intensity"
                      isOpen={isPlotToolsAdvancedOpen}
                      onToggle={() => setIsPlotToolsAdvancedOpen((current) => !current)}
                    >
                      <Slider label="alpha - SNA" value={alpha} testId="plot-alpha-slider" onChange={setAlpha} />
                      <Slider label="beta - ENA" value={beta} testId="plot-beta-slider" onChange={setBeta} />
                      <Slider label="gamma - Bridge" value={gamma} testId="plot-gamma-slider" onChange={setGamma} />
                      <label className="grid gap-2 text-sm font-black text-slate-950">
                        Normalization
                        <select
                          data-testid="plot-normalization-select"
                          value={normalization}
                          onChange={(event) => setNormalization(event.currentTarget.value as SenaNormalization)}
                          className="h-10 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-cyanGlow"
                        >
                          <option value="max">Max scaling</option>
                          <option value="log-max">Log + max scaling</option>
                          <option value="none">Raw weights</option>
                        </select>
                      </label>
                    </WorkspaceSecondaryDrawer>
                  </div>
                </Panel>
              </div>
            </div>

            <div className={cn(workspaceRailMode !== "stats" && "hidden")}>
              <div className="grid gap-4">
                <Panel title="Stats" icon={StatsNetworkMetricsIcon} className="p-4">
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-2">
                      <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
                      <MetricCell label="Density" value={formatNumber(model.socialReport.graph.density)} />
                      <MetricCell label="Avg path" value={formatNumber(model.socialReport.graph.averagePathLength)} />
                      <MetricCell label="G pairs" value={topPairs.length} />
                    </div>

                    <div
                      data-testid="stats-runtime-snapshot"
                      data-visual-role="stats-jena-jsna-runtime-snapshot"
                      className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-500">Local runtime snapshot</div>
                          <div className="mt-1 text-sm font-black text-slate-950">jENA + jSNA</div>
                        </div>
                        <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">live JS</span>
                      </div>

                      <div className="grid gap-2">
                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black uppercase text-violet-700">jENA</span>
                            <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[0.62rem] font-black text-violet-700">{enaManifest.status}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <MetricCell label="Dims" value={enaManifest.outputs?.dimensions.slice(0, 2).join(" / ") || "NA"} />
                            <MetricCell label="Variance" value={formatPercentValue(Object.values(enaManifest.outputs?.variance ?? {})[0])} />
                            <MetricCell label="Unit points" value={enaManifest.outputs?.points.length ?? 0} />
                            <MetricCell label="Line weights" value={enaManifest.outputs?.lineWeights.length ?? 0} />
                          </div>
                        </div>

                        <JenaConceptHandoffPanel audit={runtimeConsistencyAudit} />

                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black uppercase text-blue-700">jSNA</span>
                            <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[0.62rem] font-black text-blue-700">{snaManifest.status}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <MetricCell label="Engine" value={snaManifest.engineAlias} />
                            <MetricCell label="Ties" value={snaManifest.datasetCounts.weightedTies} />
                            <MetricCell label="Components" value={snaManifest.datasetCounts.components} />
                            <MetricCell label="Communities" value={snaManifest.datasetCounts.communities} />
                          </div>
                        </div>

                        <JsnaSocialHandoffPanel audit={runtimeConsistencyAudit} />
                      </div>
                    </div>

                    <MetricProvenanceSummary validation={methodValidation} />

                    <MethodProtocolHandoffPanel protocol={methodProtocol} onExportMethodProtocol={exportMethodProtocolJson} />

                    <div className="grid gap-2">
                      <div className="text-xs font-black uppercase text-slate-500">Top actors</div>
                      {topActors.map((actor) => (
                        <button
                          key={actor.id}
                          type="button"
                          onClick={() => setSelectedId(actor.id)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-cyanGlow/50"
                        >
                          <span className="block text-sm font-black text-slate-950">{actor.label}</span>
                          <span className="block text-xs font-semibold text-slate-500">strength {formatNumber(actor.strength, 1)} · degree {formatNumber(actor.degree, 1)}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-2">
                      <div className="text-xs font-black uppercase text-slate-500">Top G pairs</div>
                      {topPairs.map((pair) => {
                        const selectionTarget = pairReportSelectionTarget(model, pair);
                        return (
                          <button
                            key={pair.id}
                            type="button"
                            data-testid="stats-top-g-pair"
                            data-pair-id={pair.id}
                            data-selection-target={selectionTarget}
                            onClick={() => setSelectedId(selectionTarget)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left transition hover:border-rose-300"
                          >
                            <span className="block text-sm font-black text-slate-950">{pair.label}</span>
                            <span className="block text-xs font-semibold text-slate-500">total {formatNumber(pair.totalContribution, 1)}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-2">
                      <button data-testid="export-stats-sna-report" onClick={exportSocialReport} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export SNA report
                      </button>
                      <button data-testid="export-stats-jena-manifest" onClick={exportEnaManifestJson} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export jENA manifest
                      </button>
                      <button data-testid="export-stats-jsna-manifest" onClick={exportSnaManifestJson} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export jSNA manifest
                      </button>
                      <button data-testid="export-stats-g-report" onClick={exportPairReport} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export G report
                      </button>
                      <button data-testid="export-stats-metric-provenance" onClick={exportMetricProvenance} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export metric provenance
                      </button>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs font-black uppercase text-slate-500">Research workflow</div>
              <WorkflowRail steps={workflowStepStates} activeId={activeRailPanel.activeWorkflowId} />
            </div>
          </aside>

          <main className="order-1 min-w-0 p-4 xl:order-none">
            <WorkspaceShellPanel
              id="workflow-temporal"
              testId="workspace-central-plot-deck"
              visualRole="workspace-central-plot-deck"
              defaultPlotView="fusion"
              plotScope="current-window"
              title="Fusion Plot - Current Window"
              action={
                <div className="flex items-center gap-2">
                  <FusionPlotZoomControls
                    zoom={fusionPlotZoom}
                    onZoomIn={zoomInFusionPlot}
                    onZoomOut={zoomOutFusionPlot}
                    onReset={resetFusionPlotZoom}
                    testScope="central"
                  />
                  <button
                    type="button"
                    data-testid="maximize-fusion-plot"
                    data-visual-role="fusion-plot-maximize-control"
                    onClick={() => {
                      setActivePlotView("fusion");
                      setIsFusionPlotMaximized(true);
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-400/70 bg-white/78 px-3 text-[0.68rem] font-black normal-case text-slate-800 shadow-[0_6px_16px_rgb(15_23_42/0.1)] transition hover:border-cyanGlow/70 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Maximize
                  </button>
                </div>
              }
              className="min-h-[calc(100vh-7rem)]"
            >
              {activePlotView === "fusion" && (
                <div
                  data-testid="central-fusion-priority-plot"
                  data-visual-role="fusion-plot-priority-stack"
                  className="mb-5 grid gap-4"
                >
                  <div
                    data-testid="central-fusion-canvas-frame"
                    data-visual-role="fusion-canvas-current-window-frame"
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <Canvas
                      model={model}
                      layout={layout}
                      enaManifest={enaManifest}
	                      layers={layers}
	                      threshold={threshold}
	                      selectedId={selected?.id ?? selectedId}
	                      revealedLabelIds={revealedNodeLabelIds}
	                      onSelect={handleCanvasSelect}
	                      zoom={fusionPlotZoom}
                      className="h-[34rem]"
                    />
                  </div>
                  <ActivePlotViewToolbar
                    active={activePlotView}
                    isOpen={isPlotSwitcherOpen}
                    onToggle={() => setIsPlotSwitcherOpen((current) => !current)}
                    onSelect={(view) => {
                      setActivePlotView(view);
                      setIsPlotSwitcherOpen(false);
                    }}
                  />
                  <FusionLayerKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
                </div>
              )}

              {activePlotView !== "fusion" && (
                <ActivePlotViewToolbar
                  active={activePlotView}
                  isOpen={isPlotSwitcherOpen}
                  onToggle={() => setIsPlotSwitcherOpen((current) => !current)}
                  onSelect={(view) => {
                    setActivePlotView(view);
                    setIsPlotSwitcherOpen(false);
                  }}
                  className="mb-5"
                />
              )}

              <CentralFusionAnalysisScope
                model={model}
                activeWindow={activeTemporalWindow}
                activeIndex={activeTemporalIndex}
                windowCount={temporalWindows.length}
                fusionMathAudit={fusionMathAudit}
                activeTransition={activeTemporalTransition}
                activeWindowBrief={activeWindowBrief}
              />

              {activePlotView === "temporal" && (
                <div className="grid gap-4">
                  <TemporalWindowBuilder
                    mode={temporalMode}
                    onModeChange={setTemporalMode}
                    movingWindowSize={movingWindowSize}
                    onMovingWindowSizeChange={setMovingWindowSize}
                    movingWindowStep={movingWindowStep}
                    onMovingWindowStepChange={setMovingWindowStep}
                    turnWindowRadius={turnWindowRadius}
                    onTurnWindowRadiusChange={setTurnWindowRadius}
                    windows={temporalWindows}
                    people={model.people}
                    codes={model.codes}
                    temporalRuntimeTrace={temporalRuntimeTrace}
                    activeIndex={activeTemporalIndex}
                    onActiveIndexChange={setActiveWindowIndex}
                    isAnimating={isAnimating}
                    onAnimationToggle={() => setIsAnimating((current) => !current)}
                    animationMs={animationMs}
                    onAnimationMsChange={setAnimationMs}
                  />
                </div>
              )}

              {activePlotView === "dual" && (
                <DualLensDashboard
                  model={model}
                  enaManifest={enaManifest}
                  snaManifest={snaManifest}
                  activeWindow={activeTemporalWindow}
                  activeWindowIndex={activeTemporalIndex}
                  windowCount={temporalWindows.length}
                  surface="central"
                />
              )}

              {activePlotView === "ena" && (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
                    ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.
                  </div>
                  <Canvas
                    model={model}
                    layout="ena-space"
                    enaManifest={enaManifest}
	                    layers={layers}
	                    threshold={threshold}
	                    selectedId={selected?.id ?? selectedId}
	                    revealedLabelIds={revealedNodeLabelIds}
	                    onSelect={handleCanvasSelect}
	                    className="h-[34rem] rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              )}

              {activePlotView === "sna" && (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
                    <MetricCell label="Density" value={formatNumber(model.socialReport.graph.density)} />
                    <MetricCell label="Reciprocity" value={formatNumber(model.socialReport.graph.reciprocity)} />
                    <MetricCell label="Avg path" value={formatNumber(model.socialReport.graph.averagePathLength)} />
                    <MetricCell label="Components" value={model.socialReport.graph.componentCount} />
                    <MetricCell label="Largest comp." value={model.socialReport.graph.largestComponentSize} />
                  </div>
                  <SocialMetricsTable actors={model.socialReport.actors} />
                </div>
              )}

              {activePlotView === "evidence" && (
                <EvidenceLedgerPanel
                  ledger={evidenceLedger}
                  sourceFilter={evidenceSourceFilter}
                  onSourceFilterChange={setEvidenceSourceFilter}
                  onExportJson={exportEvidenceLedgerJson}
                />
              )}

              {activePlotView === "matrix" && (
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                  <MatrixPreview title="S: social layer" rowLabels={model.matrices.S.labels} columnLabels={model.matrices.S.labels} values={model.matrices.S.raw} />
                  <MatrixPreview title="W: concept layer" rowLabels={model.matrices.W.labels} columnLabels={model.matrices.W.labels} values={model.matrices.W.raw} />
                  <MatrixPreview title="B: bridge layer" rowLabels={model.matrices.B.rowLabels} columnLabels={model.matrices.B.columnLabels} values={model.matrices.B.raw} />
                  <MatrixPreview title="G: person-code-pair layer" rowLabels={model.matrices.G.rowLabels} columnLabels={model.matrices.G.columnLabels} values={model.matrices.G.raw} />
                </div>
              )}

              <WorkspaceDataViewDrawer
                model={model}
                activeWindow={activeTemporalWindow}
                isOpen={isWorkspaceDataViewOpen}
                onToggle={() => setIsWorkspaceDataViewOpen((current) => !current)}
              />
            </WorkspaceShellPanel>
          </main>

          <aside className="order-3 grid min-w-0 content-start gap-4 border-t border-slate-300/70 bg-[#e1e6ec] p-4 xl:order-none xl:border-l xl:border-t-0">
            <WorkspaceViewportPanel
              id="workflow-canvas"
              testId="workspace-primary-plot"
              visualRole="workspace-primary-plot"
              title="Primary Plot - Fusion Canvas"
            >
              <div className="mb-3 grid rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-3">
                {layoutOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    data-testid={`canvas-layout-${item.value}`}
                    onClick={() => setLayout(item.value)}
                    className={cn(
                      "rounded-md px-3 py-2 text-xs font-black transition",
                      layout === item.value ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-slate-500 hover:bg-white hover:text-slate-950"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                {selectedLayout.note}
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => (
                  <span key={layer} className={cn("rounded-full border px-3 py-1 text-xs font-black", layerCopy[layer].className)}>
                    {layerCopy[layer].label}: {model.edges.filter((edge) => edge.layer === layer && edge.normalizedWeight >= threshold).length}
                  </span>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <Canvas
                  model={model}
                  layout={layout}
                  enaManifest={enaManifest}
	                  layers={layers}
	                  threshold={threshold}
	                  selectedId={selected?.id ?? selectedId}
	                  revealedLabelIds={revealedNodeLabelIds}
	                  onSelect={handleCanvasSelect}
	                  className="h-[22rem]"
                />
              </div>
              <div className="mt-3">
                <FusionLayerKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
              </div>
              <div className="mt-3 grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <div className="flex items-center gap-2 font-black text-amber-900">
                  <Info className="h-4 w-4" /> Interpretation guardrail
                </div>
                {layout === "joint"
                  ? "Joint mode uses the normalized fusion matrix as a deterministic visual embedding; export weights, normalization, and stability checks before making substantive distance claims."
                  : layout === "ena-space"
                    ? "ENA Space uses jENA projected unit points and code node positions when the manifest is computed; report dimensions, variance, and manifest settings with any distance interpretation."
                    : "In explanatory mode, cross-layer distances are arranged for readability and should not be interpreted as strict statistical distances."}
              </div>
            </WorkspaceViewportPanel>

            <WorkspaceViewportPanel
              id="workflow-evidence"
              testId="workspace-secondary-plot"
              visualRole="workspace-secondary-plot"
              title="Secondary Plot - Compare + Evidence"
            >
              <WorkspaceSecondaryComparisonLens
                currentModel={model}
                baselineModel={timelineModel}
                activeWindow={activeTemporalWindow}
              />
              {selected ? (
                <Inspector
                  selected={selected}
                  options={model.options}
                  pairReport={model.pairReport}
                  matrixFingerprints={fusionMathAudit.matrixFingerprints}
                  edgeStrokeScale={visibleEdgeStrokeScale}
                  jenaConceptPairHandoffRows={jenaConceptPairHandoffRows}
                  jsnaSocialTieHandoffRows={jsnaSocialTieHandoffRows}
                />
              ) : <div className="text-sm text-muted">Select a node or edge.</div>}
            </WorkspaceViewportPanel>

            <Panel title="Feasibility Signal" icon={Sparkles}>
              <div className="grid gap-3 text-sm leading-6 text-muted">
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <span className="font-black text-foreground">Achievable now:</span> deterministic S/W/B construction, SNA.js social metrics, layer weighting, evidence-linked SVG inspection, matrix export.
                </div>
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <span className="font-black text-foreground">Needs validation:</span> benchmark jENA outputs, formal joint embedding choices, statistical uncertainty, coding reliability.
                </div>
              </div>
            </Panel>

            {SHOW_ARCHIVED_FORMULA_PANEL && (
              <Panel title="SENA Formula" icon={Braces}>
                <MethodFormulaPanel
                  model={model}
                  fusionMathAudit={fusionMathAudit}
                  onExportMathAudit={exportFusionMathAuditJson}
                  onExportMethodProtocol={exportMethodProtocolJson}
                  onExportVisualGrammar={exportVisualGrammarJson}
                />
              </Panel>
            )}
          </aside>
        </div>
      </div>

      <div className="mx-auto mt-5 2xl:max-w-[106rem]">
        <DualLensDashboard
          model={model}
          enaManifest={enaManifest}
          snaManifest={snaManifest}
          activeWindow={activeTemporalWindow}
          activeWindowIndex={activeTemporalIndex}
          windowCount={temporalWindows.length}
        />

        <div id="sena-stats-deck" className="mt-5 grid scroll-mt-24 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Panel title="SNA Metrics" icon={Network}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
                <MetricCell label="Density" value={formatNumber(model.socialReport.graph.density)} />
                <MetricCell label="Reciprocity" value={formatNumber(model.socialReport.graph.reciprocity)} />
                <MetricCell label="Avg path" value={formatNumber(model.socialReport.graph.averagePathLength)} />
                <MetricCell label="Components" value={model.socialReport.graph.componentCount} />
                <MetricCell label="Largest comp." value={model.socialReport.graph.largestComponentSize} />
              </div>
              <button onClick={exportSocialReport} className={buttonStyles({ variant: "secondary" })}>
                <Download className="h-4 w-4" /> Export SNA report
              </button>
            </div>
            <SocialMetricsTable actors={model.socialReport.actors} />
          </Panel>

          <Panel title="Community Detection" icon={UsersRound}>
            <div className="mb-4 rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm font-semibold leading-6 text-muted">
              {model.socialReport.graph.communityDetection}; engine {model.socialReport.graph.engine}; mode {model.socialReport.graph.mode}.
            </div>
            <CommunityList communities={model.socialReport.communities} />
          </Panel>
        </div>

        <div className="mt-5">
          <Panel title="Pair Contribution G" icon={GitMerge}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricCell label="Code-pairs" value={model.matrices.G.pairs.length} />
                <MetricCell label="Active pairs" value={model.pairReport.filter((pair) => pair.totalContribution > 0).length} />
                <MetricCell label="G total" value={formatNumber(model.pairReport.reduce((total, pair) => total + pair.totalContribution, 0), 1)} />
              </div>
              <button onClick={exportPairReport} className={buttonStyles({ variant: "secondary" })}>
                <Download className="h-4 w-4" /> Export G report
              </button>
            </div>
            <PairContributionTable pairs={model.pairReport} />
          </Panel>
        </div>

        <div className="mt-5">
          <Panel title="Evidence Ledger" icon={PanelRight}>
            <EvidenceLedgerPanel
              ledger={evidenceLedger}
              sourceFilter={evidenceSourceFilter}
              onSourceFilterChange={setEvidenceSourceFilter}
              onExportJson={exportEvidenceLedgerJson}
            />
          </Panel>
        </div>

        <div className="mt-5">
          <Panel title="Method Validation" icon={CheckCircle2}>
            <MethodValidationPanel validation={methodValidation} />
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Matrix Evidence" icon={Binary}>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <MatrixPreview title="S: social layer" rowLabels={model.matrices.S.labels} columnLabels={model.matrices.S.labels} values={model.matrices.S.raw} />
              <MatrixPreview title="W: concept layer" rowLabels={model.matrices.W.labels} columnLabels={model.matrices.W.labels} values={model.matrices.W.raw} />
              <MatrixPreview title="B: bridge layer" rowLabels={model.matrices.B.rowLabels} columnLabels={model.matrices.B.columnLabels} values={model.matrices.B.raw} />
              <MatrixPreview title="G: person-code-pair layer" rowLabels={model.matrices.G.rowLabels} columnLabels={model.matrices.G.columnLabels} values={model.matrices.G.raw} />
            </div>
          </Panel>

          <div className="grid content-start gap-5">
            <Panel title="Temporal Runtime Trace" icon={Zap}>
              <TemporalRuntimeTracePanel trace={temporalRuntimeTrace} onExportJson={exportTemporalRuntimeTraceJson} />
            </Panel>
          </div>
        </div>

        <div className="mt-5">
          <Panel id="workflow-report" title="Report Generator" icon={FileText}>
            <ReportGenerator
              model={model}
              completenessAudit={reportCompletenessAudit}
              reviewPacketAudit={reviewPacketAudit}
              pilotReadinessAudit={pilotReadinessAudit}
              claimReadinessGate={claimReadinessGate}
              codingReliabilityGate={codingReliabilityGate}
              developmentPlan={developmentPlan}
              demoVerification={demoVerificationPreview}
              demoVerificationCompatibilityAudit={demoVerificationCompatibilityAuditPreview}
              productionPageContract={productionPageContract}
              onDemoManualReviewChange={updateDemoManualReview}
              reportTitle={reportTitle}
              onReportTitleChange={setReportTitle}
              reviewStatus={reviewStatus}
              onReviewStatusChange={setReviewStatus}
              reviewer={reviewer}
              onReviewerChange={setReviewer}
              interpretation={interpretation}
              onInterpretationChange={setInterpretation}
              limitations={limitations}
              onLimitationsChange={setLimitations}
               nextActions={nextActions}
               onNextActionsChange={setNextActions}
               dataGovernanceIrbApprovalId={dataGovernanceIrbApprovalId}
               onDataGovernanceIrbApprovalIdChange={setDataGovernanceIrbApprovalId}
               dataGovernanceConsentScope={dataGovernanceConsentScope}
               onDataGovernanceConsentScopeChange={setDataGovernanceConsentScope}
               dataGovernanceRetentionPolicy={dataGovernanceRetentionPolicy}
               onDataGovernanceRetentionPolicyChange={setDataGovernanceRetentionPolicy}
               dataGovernanceUsageConstraints={dataGovernanceUsageConstraints}
               onDataGovernanceUsageConstraintsChange={setDataGovernanceUsageConstraints}
               dataGovernanceDataSteward={dataGovernanceDataSteward}
               onDataGovernanceDataStewardChange={setDataGovernanceDataSteward}
               codingReliabilityStatus={codingReliabilityStatus}
               onCodingReliabilityStatusChange={setCodingReliabilityStatus}
              codingReliabilityReviewer={codingReliabilityReviewer}
              onCodingReliabilityReviewerChange={setCodingReliabilityReviewer}
              codingScheme={codingScheme}
              onCodingSchemeChange={setCodingScheme}
              unitOfCoding={unitOfCoding}
              onUnitOfCodingChange={setUnitOfCoding}
              coderCount={coderCount}
              onCoderCountChange={setCoderCount}
              agreementMetric={agreementMetric}
              onAgreementMetricChange={setAgreementMetric}
              agreementValue={agreementValue}
              onAgreementValueChange={setAgreementValue}
              adjudicationNotes={adjudicationNotes}
              onAdjudicationNotesChange={setAdjudicationNotes}
              reliabilityLimitations={reliabilityLimitations}
              onReliabilityLimitationsChange={setReliabilityLimitations}
              onExportWalkthroughJson={exportDemoWalkthroughJson}
              onExportVerificationJson={exportDemoVerificationJson}
              onExportVerificationCompatibilityJson={exportDemoVerificationCompatibilityJson}
              onExportProductionPageContractJson={exportProductionPageContractJson}
              onExportProjectSnapshot={exportModel}
              onExportDevelopmentPlanJson={exportDevelopmentPlanJson}
              onExportEnaReport={exportEnaReport}
              onExportRuntimeBundleJson={exportRuntimeBundleJson}
              onExportRuntimeConsistencyAuditJson={exportRuntimeConsistencyAuditJson}
              onExportReadinessJson={exportPilotReadinessJson}
              onExportCodingReliabilityJson={exportCodingReliabilityJson}
              onExportReliabilityDashboardJson={exportReliabilityDashboardJson}
              onExportClaimReadinessJson={exportClaimReadinessJson}
              onExportReviewPacket={exportReviewPacketJson}
              onExportJson={exportReportJson}
              onExportMarkdown={exportReportMarkdown}
              onReliabilityUpload={handleReliabilityUpload}
              hasReliabilityDashboard={Boolean(latestReliabilityDashboard)}
              onExportPublication={exportPublication}
            />
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Panel title="Dual Lens Basis" icon={UsersRound}>
            <p className="text-sm leading-6 text-muted">
              SNA keeps actor ties analytically separate from ENA code co-occurrence before fusion. This avoids confusing social centrality with epistemic quality.
            </p>
          </Panel>
          <Panel title="Fusion Claim" icon={Network}>
            <p className="text-sm leading-6 text-muted">
              The bridge layer asks who contributed to which concepts, and the enhanced pair contribution estimates who helped activate important code-pair links.
            </p>
          </Panel>
          <Panel title="Report Readiness" icon={FileText}>
            <p className="text-sm leading-6 text-muted">
              Every visible claim can be exported with weights, normalization, matrix values, and original utterance evidence for human-reviewed reporting.
            </p>
          </Panel>
        </div>

        {model.summary.warnings.length > 0 && (
          <div className="sena-warning-panel mt-5 rounded-lg p-4 text-sm font-semibold">
            {model.summary.warnings.join(" ")}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/#method" className={buttonStyles({ variant: "secondary" })}>
            <Braces className="h-4 w-4" /> Read framework
          </Link>
          <Link href="/#workspace" className={buttonStyles({ variant: "secondary" })}>
            <Zap className="h-4 w-4" /> Platform modules
          </Link>
        </div>
      </div>
    </section>
  );
}
