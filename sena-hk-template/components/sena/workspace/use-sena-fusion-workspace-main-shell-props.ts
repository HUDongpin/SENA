"use client";

import { useEffect, useMemo, useState } from "react";
import {
  lessonStudySenaContract
} from "@/lib/sena/pilot-assets";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type { SenaReliabilityDashboard } from "@/lib/sena/reliability";
import {
  buildAbsoluteEdgeStrokeScale,
  buildConceptPairContributionMap,
  buildEdgeStrokeScale,
  senaOrbitSocialStrokeRange
} from "@/lib/sena/visual-encoding";
import {
  buildSenaActiveWindowBrief,
  buildSenaDataContractAudit,
  buildSenaCodingReliabilityGate,
  buildSenaMarkdownReport,
  buildSenaDemoVerificationCompatibilityAudit,
  buildSenaDemoVerification,
  buildSenaDemoWalkthrough,
  buildSenaDevelopmentPlan,
  buildSenaEvidenceLedger,
  buildSenaEnaManifest,
  buildSenaFusionMathAudit,
  buildSenaClaimReadinessGate,
  buildSenaMethodProtocol,
  buildSenaModel,
  buildSenaReport,
  buildSenaReportCompletenessAudit,
  buildSenaReviewPacket,
  buildSenaRuntimeConsistencyAudit,
  buildSenaJenaConceptPairHandoffRows,
  buildSenaJsnaSocialTieHandoffRows,
  buildSenaPilotReadinessAudit,
  buildSenaSnaManifest,
  buildSenaTemporalRuntimeTrace,
  buildSenaValidation,
  importSenaJsonContract,
  scopeSenaDatasetToWindow,
  type SenaDataContractAudit,
  type SenaDataGovernanceMetadata,
  type SenaActiveWindowBrief,
  type SenaClaimReadinessGate,
  type SenaCodingReliabilityGate,
  type SenaCodingReliabilityReview,
  type SenaDemoVerification,
  type SenaDemoVerificationCompatibilityAudit,
  type SenaDevelopmentPlan,
  type SenaEdge,
  type SenaEvidenceLedger,
  type SenaFusionMathAudit,
  type SenaGroupComparisonMetric,
  type SenaLayer,
  type SenaLayoutMode,
  type SenaMethodProtocol,
  type SenaModel,
  type SenaNormalization,
  type SenaPilotReadinessAudit,
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
} from "./analysis-runtime";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import type { SenaPlotView } from "./plot-tools-panel";
import type { EvidenceSourceFilter } from "./evidence-ledger-panel";
import {
  type WorkflowStatus,
  type WorkflowStepState,
  type WorkspaceRailMode
} from "./workspace-shell-panels";
import {
  SHOW_ARCHIVED_FORMULA_PANEL,
  StatsNetworkMetricsIcon,
  downloadText,
  formatDelta,
  formatNumber,
  layerCopy,
  layoutOptions,
  platformDecisionTimestampedEvidenceIds,
  plotViewOptions,
  productionPageContract,
  senaEnterpriseImportFileAccept,
  temporalModeOptions,
  upperTriangleTotal,
  workflowSteps,
  workspaceRailItems,
  workspaceRailPanelCopy
} from "./workspace-static-config";
import { buildWorkspaceEnterpriseRuntimeContainerProps } from "./workspace-enterprise-runtime-container-props";
import { buildWorkspaceCentralPlotDeckContainerProps } from "./workspace-central-plot-deck-container-props";
import { buildWorkspaceRightInspectorContainerProps } from "./workspace-right-inspector-container-props";
import { buildWorkspaceHeaderLeftRailContainerProps } from "./workspace-header-left-rail-container-props";
import { buildWorkspaceFusionOverlayRailMainShellContainerProps } from "./workspace-fusion-overlay-rail-main-shell-container-props";
import { buildWorkspaceReportAndStatsDeckContainerProps } from "./workspace-report-and-stats-deck-container-props";
import type { UploadedSenaTable } from "./uploaded-table-mapper";
import { useEnterpriseAuditBackupActions } from "./use-enterprise-audit-backup-actions";
import { useEnterpriseCollaborationActions } from "./use-enterprise-collaboration-actions";
import { useEnterpriseCollaborationEffects } from "./use-enterprise-collaboration-effects";
import { useEnterpriseDatabaseSyncActions } from "./use-enterprise-database-sync-actions";
import { useEnterpriseExpertReviewActions } from "./use-enterprise-expert-review-actions";
import { useEnterpriseGoLiveActions } from "./use-enterprise-go-live-actions";
import { useEnterpriseGovernanceExportActions } from "./use-enterprise-governance-export-actions";
import { useEnterpriseImportActions } from "./use-enterprise-import-actions";
import { useEnterpriseJsonArtifactExportAction } from "./use-enterprise-json-artifact-export-action";
import { useEnterpriseMfaActions } from "./use-enterprise-mfa-actions";
import { useEnterpriseNotificationActions } from "./use-enterprise-notification-actions";
import { useEnterpriseOpsAlertsActions } from "./use-enterprise-ops-alerts-actions";
import { useEnterprisePlatformDecisionActions } from "./use-enterprise-platform-decision-actions";
import { useEnterpriseProjectActions } from "./use-enterprise-project-actions";
import { useEnterprisePublicationActions } from "./use-enterprise-publication-actions";
import { useEnterpriseProvisioningReadinessActions } from "./use-enterprise-provisioning-readiness-actions";
import { useEnterpriseReleaseGateActions } from "./use-enterprise-release-gate-actions";
import { useEnterpriseRefreshActions } from "./use-enterprise-refresh-actions";
import { useEnterpriseReliabilityActions } from "./use-enterprise-reliability-actions";
import { useEnterpriseTeamActions } from "./use-enterprise-team-actions";
import { useEnterpriseUploadStorageActions } from "./use-enterprise-upload-storage-actions";
import { useEnterpriseValidationActions } from "./use-enterprise-validation-actions";
import { useEnterpriseWorkspaceApi } from "./use-enterprise-runtime";
import { useDataContractEvidenceExportActions } from "./use-data-contract-evidence-export-actions";
import { useContractUploadAction } from "./use-contract-upload-action";
import { useCurrentProjectSnapshotBuilder } from "./use-current-project-snapshot-builder";
import { useDataImportMappedTableActions } from "./use-data-import-mapped-table-actions";
import {
  type DemoManualReviewState,
  useDemoVerificationManualReviewActions
} from "./use-demo-verification-manual-review-actions";
import { useFusionPlotInteractions } from "./use-fusion-plot-interactions";
import { useFusionCanvasSelectionState } from "./use-fusion-canvas-selection-state";
import { useMethodArtifactExportActions } from "./use-method-artifact-export-actions";
import { useProjectSnapshotExportActions } from "./use-project-snapshot-export-actions";
import { useProjectSnapshotRestoreAction } from "./use-project-snapshot-restore-action";
import { useReportAndEvidenceArtifactExportActions } from "./use-report-and-evidence-artifact-export-actions";
import { useRuntimeBundleExportActions } from "./use-runtime-bundle-export-actions";
import { useRuntimeManifestExportActions } from "./use-runtime-manifest-export-actions";
import { useSenaReportExportActions } from "./use-sena-report-export-actions";
import { useTemporalAnimationEffects } from "./use-temporal-animation-effects";
import { useTemporalRuntimeTraceExportActions } from "./use-temporal-runtime-trace-export-actions";
import type {
  EnterpriseContext,
  EnterpriseRole,
  EnterpriseTeamState,
  EnterpriseUploadRecord,
  EnterpriseUploadStorageState,
  EnterpriseMfaStatus,
  EnterpriseMfaSetup,
  EnterpriseSessionSummary,
  EnterpriseSessionList,
  EnterpriseSsoPreflight,
  EnterpriseDeploymentEnv,
  EnterpriseDeploymentServiceEndpoint,
  EnterpriseDeploymentPlatformDecision,
  EnterpriseIdentityProductionEvidence,
  EnterpriseIdentityInstitutionActionPlan,
  EnterpriseIdentityProductionEvidenceDossier,
  EnterpriseOrganizationDeploymentPackage,
  EnterpriseProjectSummary,
  EnterpriseImportRun,
  EnterpriseAnalysisRun,
  EnterpriseValidationParityEvidence,
  EnterpriseCollaborationState,
  LocalEnterpriseValidationResult,
  EnterpriseClaimEvidencePackage,
  EnterprisePlatformDecisionId,
  EnterprisePlatformDecisionStatus,
  EnterprisePlatformDecisionState,
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseVerificationStatus,
  EnterpriseReleaseGateReview,
  EnterpriseReleaseGateState
} from "./enterprise-contracts";

type LayerVisibility = Record<SenaLayer, boolean>;

export function useSenaFusionWorkspaceMainShellProps() {
  const [dataset, setDataset] = useState(() => lessonStudySenaContract);
  const [uploadedTables, setUploadedTables] = useState<UploadedSenaTable[]>([]);
  const [importMessage, setImportMessage] = useState("Lesson-study sample loaded from the bundled SENA pilot package.");
  const [importError, setImportError] = useState<string | null>(null);
  // ADR 0009 D5: Fusion opens on the canonical plane with its social orbit.
  // joint and explanatory remain one click away, relabeled "Diagnostic".
  const [layout, setLayout] = useState<SenaLayoutMode>("plane-orbit");
  const [jointEmbeddingOperator, setJointEmbeddingOperator] = useState<SenaJointEmbeddingOperator>("mds-schoenberg");
  const [normalization, setNormalization] = useState<SenaNormalization>("max");
  const [alpha, setAlpha] = useState(1);
  const [beta, setBeta] = useState(1);
  const [gamma, setGamma] = useState(1);
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
  const {
    enterpriseCsrfHeaders,
    enterpriseJsonHeaders,
    resetEnterpriseCsrfToken
  } = useEnterpriseWorkspaceApi();
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
  const [validationMetric, setValidationMetric] = useState<SenaGroupComparisonMetric>("socialStrength");
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
  const {
    handleCanvasSelect,
    revealedNodeLabelIds,
    selected,
    selectedId,
    setSelectedId
  } = useFusionCanvasSelectionState({ model });
  const visibleFusionEdges = useMemo(
    () => model.edges.filter((edge) => layers[edge.layer] && edge.normalizedWeight >= threshold),
    [layers, model.edges, threshold]
  );
  const visibleConceptPairContributions = useMemo(() => buildConceptPairContributionMap(model), [model]);
  // The inspector's line-weight provenance has to describe the surface the
  // reader is looking at. A1's canvas scales each layer relative to whatever
  // survived the current filter; the orbit anchors every lane on the corpus and
  // draws in its own narrower band, so in plane-orbit the same scale the orbit
  // draws with is what the inspector reads back — otherwise the panel reports a
  // width no line on screen has.
  const visibleEdgeStrokeScale = useMemo(
    () => (layout === "plane-orbit"
      ? buildAbsoluteEdgeStrokeScale(visibleFusionEdges, visibleConceptPairContributions, {
        social: senaOrbitSocialStrokeRange
      })
      : buildEdgeStrokeScale(visibleFusionEdges, visibleConceptPairContributions)),
    [layout, visibleConceptPairContributions, visibleFusionEdges]
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

  const {
    buildCurrentProjectSnapshot
  } = useCurrentProjectSnapshotBuilder({
    activeTemporalWindow,
    codingReliabilityReview,
    dataGovernanceReview,
    dataset,
    demoManualReviews,
    interpretation,
    limitations,
    model,
    nextActions,
    reportTitle,
    reviewer,
    reviewStatus,
    temporalRuntimeTrace
  });

  const {
    logoutEnterpriseSessionFromWorkspace,
    refreshEnterpriseTeamState,
    refreshEnterpriseSessionList,
    refreshEnterprisePlatformDecisionState,
    refreshEnterpriseReleaseGateReviews,
    refreshEnterpriseState,
    revokeEnterpriseSession
  } = useEnterpriseRefreshActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseSessionList,
    enterpriseJsonHeaders,
    resetEnterpriseCsrfToken,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseContext,
    setEnterpriseProjects,
    setEnterpriseTeamState,
    setEnterpriseUploadStorage,
    setEnterpriseMfaStatus,
    setEnterpriseMfaSetup,
    setEnterpriseSessionList,
    setEnterpriseSsoPreflight,
    setEnterpriseDeploymentPackage,
    setEnterpriseIdentityProductionEvidence,
    setEnterpriseImportRuns,
    setEnterpriseAnalysisRuns,
    setActiveEnterpriseProjectId,
    setEnterpriseCollaboration,
    setEnterpriseClaimPackage,
    setEnterprisePlatformDecisionState,
    setEnterpriseReleaseGateState
  });

  const {
    refreshEnterpriseCollaboration,
    touchEnterprisePresence,
    addEnterpriseComment,
    addEnterpriseAdjudication,
    deliverEnterpriseCollaborationPubSubFromWorkspace,
    runEnterpriseSsoPreflightFromWorkspace
  } = useEnterpriseCollaborationActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseProjectId,
    workspaceRailMode,
    activePlotView,
    enterpriseJsonHeaders,
    enterpriseComment,
    adjudicationItemId,
    adjudicationCodeId,
    adjudicationDecision,
    adjudicationNotesQuick,
    latestEnterpriseReliabilityRunId: latestEnterpriseReliabilityRun?.id,
    selected,
    setEnterpriseCollaboration,
    setEnterpriseClaimPackage,
    setEnterpriseSsoPreflight,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseComment,
    setAdjudicationItemId,
    setAdjudicationCodeId,
    setAdjudicationNotesQuick
  });

  const {
    runEnterpriseValidationComparison,
    reviewEnterpriseValidationRun
  } = useEnterpriseValidationActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    activeEnterpriseProjectId,
    dataset,
    buildOptions,
    validationGroupField,
    selectedValidationGroupA,
    selectedValidationGroupB,
    validationMetric,
    validationPreregistrationNote,
    validationMethodNote,
    validationStudySpecificInferenceReference,
    validationReviewNote,
    latestEnterpriseValidationRunId: latestEnterpriseValidationRun?.id,
    enterpriseJsonHeaders,
    buildCurrentProjectSnapshot,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseValidationResult,
    setValidationReviewNote
  });

  const {
    exportEnterpriseJsonArtifact
  } = useEnterpriseJsonArtifactExportAction({
    downloadText,
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    exportEnterpriseExpertReviewDossierJson,
    submitEnterpriseExpertReview,
    updateEnterpriseExpertReview
  } = useEnterpriseExpertReviewActions({
    activeEnterpriseTeamId,
    activeEnterpriseProjectId,
    latestEnterpriseValidationRunId: latestEnterpriseValidationRun?.id,
    latestEnterpriseExpertReview,
    expertReviewerName,
    expertExpertiseArea,
    expertClaimScope,
    expertDataAdequacy,
    expertMethodFit,
    expertInterpretationValidity,
    expertConcerns,
    expertRecommendations,
    limitations,
    enterpriseJsonHeaders,
    refreshEnterpriseCollaboration,
    exportEnterpriseJsonArtifact,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setExpertConcerns,
    setExpertRecommendations
  });

  const {
    handleReliabilityUpload,
    reviewEnterpriseReliabilityRun
  } = useEnterpriseReliabilityActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    activeEnterpriseProjectId,
    latestEnterpriseReliabilityRunId: latestEnterpriseReliabilityRun?.id,
    reliabilityReviewNote,
    codingReliabilityReviewer,
    reviewer,
    codingScheme,
    unitOfCoding,
    coderCount,
    agreementMetric,
    agreementValue,
    adjudicationNotes,
    reliabilityLimitations,
    enterpriseJsonHeaders,
    enterpriseCsrfHeaders,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseReliabilityResult,
    setReliabilityReviewNote,
    setCodingReliabilityStatus,
    setCodingReliabilityReviewer,
    setCodingScheme,
    setUnitOfCoding,
    setCoderCount,
    setAgreementMetric,
    setAgreementValue,
    setAdjudicationNotes,
    setReliabilityLimitations
  });

  const {
    refreshEnterpriseProvisioningReadiness
  } = useEnterpriseProvisioningReadinessActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseDeploymentPackage,
    setEnterpriseIdentityProductionEvidence
  });

  const {
    deliverEnterpriseOpsAlertsFromWorkspace,
    exportEnterpriseOpsAlertsJson
  } = useEnterpriseOpsAlertsActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    enterpriseJsonHeaders,
    exportEnterpriseJsonArtifact,
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    deliverEnterpriseAuditLogFromWorkspace,
    deliverEnterpriseBackupFromWorkspace,
    exportEnterpriseAuditCsv,
    exportEnterpriseBackupJson
  } = useEnterpriseAuditBackupActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    exportEnterpriseJsonArtifact,
    refreshEnterpriseTeamState,
    downloadText,
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    syncEnterpriseDatabaseFromWorkspace
  } = useEnterpriseDatabaseSyncActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    exportEnterpriseCapabilityAuditJson,
    exportEnterpriseDeploymentPackageJson,
    exportEnterpriseGovernanceHealthJson,
    exportEnterpriseIdentityProductionEvidenceJson,
    exportEnterpriseNativeAdapterCertificationJson,
    exportEnterpriseOpsReadinessJson,
    exportEnterpriseOpsStatusJson,
    exportEnterpriseSaasOperationsReadinessJson,
    exportEnterpriseSecurityPostureJson
  } = useEnterpriseGovernanceExportActions({
    activeEnterpriseTeamId,
    exportEnterpriseJsonArtifact
  });

  const {
    applyEnterpriseIdentityRequestToPlatformDecision,
    exportEnterprisePlatformDecisionRegisterJson,
    submitEnterprisePlatformDecisionReview
  } = useEnterprisePlatformDecisionActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    platformDecisionId,
    platformDecisionStatus,
    platformDecisionAcceptBridge,
    platformDecisionOwnerName,
    platformDecisionOwnerRole,
    platformDecisionEnvironment,
    platformDecisionEvidenceUrl,
    platformDecisionProductionEvidenceIds,
    platformDecisionProductionEvidenceVerifiedAt,
    platformDecisionNotes,
    platformDecisionRequiresIdentityEvidenceUrl,
    platformDecisionRequiresIdentityEvidenceTimestamp,
    platformRequestPacket,
    platformRequestPacketPolicyHash,
    enterpriseJsonHeaders,
    exportEnterpriseJsonArtifact,
    refreshEnterprisePlatformDecisionState,
    refreshEnterpriseProvisioningReadiness,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseIdentityProductionEvidence,
    setPlatformDecisionId,
    setPlatformDecisionStatus,
    setPlatformDecisionAcceptBridge,
    setPlatformDecisionOwnerName,
    setPlatformDecisionOwnerRole,
    setPlatformDecisionEnvironment,
    setPlatformDecisionEvidenceUrl,
    setPlatformDecisionProductionEvidenceIds,
    setPlatformDecisionProductionEvidenceVerifiedAt,
    setPlatformDecisionNotes
  });

  const {
    exportEnterpriseReleaseGateReviewsJson,
    submitEnterpriseReleaseGateReview
  } = useEnterpriseReleaseGateActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    releaseGateDecision,
    releaseGateVersion,
    releaseGateEnvironment,
    releaseGateApproverName,
    releaseGateApproverRole,
    releaseGateNotes,
    releaseGateVerificationStatus,
    releaseGateVerificationSummary,
    releaseGateVerificationHash,
    enterpriseJsonHeaders,
    refreshEnterpriseReleaseGateReviews,
    refreshEnterpriseProvisioningReadiness,
    exportEnterpriseJsonArtifact,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setReleaseGateNotes
  });

  const {
    applyEnterpriseGoLiveRehearsalDraft,
    exportEnterpriseGoLiveAttestationsJson,
    exportEnterpriseGoLiveMonitorJson,
    exportEnterpriseGoLiveRehearsalJson,
    exportEnterpriseGoLiveRollbackDrillJson,
    submitEnterpriseGoLiveAttestation
  } = useEnterpriseGoLiveActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    releaseGateDecision,
    releaseGateVersion,
    releaseGateEnvironment,
    releaseGateApproverName,
    releaseGateApproverRole,
    releaseGateNotes,
    releaseGateVerificationStatus,
    enterpriseJsonHeaders,
    exportEnterpriseJsonArtifact,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setReleaseGateDecision,
    setReleaseGateEnvironment,
    setReleaseGateVersion,
    setReleaseGateNotes,
    setReleaseGateVerificationStatus,
    setReleaseGateVerificationSummary,
    setReleaseGateVerificationHash
  });

  const {
    disableEnterpriseMfaFromCode,
    enableEnterpriseMfaFromSetup,
    startEnterpriseMfaSetup
  } = useEnterpriseMfaActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    enterpriseMfaSetup,
    enterpriseMfaEnableCode,
    enterpriseMfaDisableCode,
    enterpriseJsonHeaders,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseMfaStatus,
    setEnterpriseMfaSetup,
    setEnterpriseMfaEnableCode,
    setEnterpriseMfaDisableCode
  });

  const {
    acceptTeamInvitation,
    createTeamInvitation,
    revokeTeamInvitation,
    updateTeamMembership
  } = useEnterpriseTeamActions({
    activeEnterpriseTeamId,
    teamInviteEmail,
    teamInviteRole,
    teamInviteCode,
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    refreshEnterpriseState,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseContext,
    setTeamInviteEmail,
    setTeamInviteCode
  });

  const {
    deliverEnterpriseEmailsFromWorkspace,
    deliverEnterpriseNotifications,
    markEnterpriseNotificationReadFromWorkspace
  } = useEnterpriseNotificationActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    createEnterpriseUploadRegistryFiles,
    deliverEnterpriseUploadObjectStorage,
    refreshEnterpriseUploadStorage
  } = useEnterpriseUploadStorageActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseCsrfHeaders,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseUploadStorage
  });

  const {
    restoreProjectSnapshot
  } = useProjectSnapshotRestoreAction({
    setActiveTemporalWindow: setPendingActiveWindow,
    setAdjudicationNotes,
    setAgreementMetric,
    setAgreementValue,
    setAlpha,
    setBeta,
    setCoderCount,
    setCodingReliabilityReviewer,
    setCodingReliabilityStatus,
    setCodingScheme,
    setDataGovernanceConsentScope,
    setDataGovernanceDataSteward,
    setDataGovernanceIrbApprovalId,
    setDataGovernanceRetentionPolicy,
    setDataGovernanceUsageConstraints,
    setDataset,
    setDemoManualReviews,
    setGamma,
    setImportError,
    setImportMessage,
    setInterpretation,
    setLimitations,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setMovingWindowSize,
    setMovingWindowStep,
    setNextActions,
    setNormalization,
    setReliabilityLimitations,
    setReportTitle,
    setReviewStatus,
    setReviewer,
    setSelectedId,
    setTemporalMode,
    setTurnWindowRadius,
    setUnitOfCoding,
    setUploadedTables
  });

  const {
    importFilesViaEnterpriseApi
  } = useEnterpriseImportActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    enterpriseCsrfHeaders,
    setEnterpriseBusy,
    setWorkspaceRailMode,
    setDataset,
    setUploadedTables,
    setDemoManualReviews,
    setSelectedId,
    setImportMessage,
    setImportError,
    setEnterpriseMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setActiveEnterpriseProjectId,
    setEnterpriseImportRuns,
    setEnterpriseProjects,
    setEnterpriseAnalysisRuns,
    restoreProjectSnapshot,
    refreshEnterpriseState,
    refreshEnterpriseCollaboration,
    touchEnterprisePresence
  });

  const {
    openEnterpriseProject,
    restoreEnterpriseProjectRevision,
    runEnterpriseAnalysis,
    saveEnterpriseProject
  } = useEnterpriseProjectActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    activeEnterpriseTeamName: enterpriseContext?.teams[0]?.name ?? "SENA team",
    activeEnterpriseProjectId,
    reportTitle,
    modelSummary: model.summary,
    enterpriseProjects,
    enterpriseCollaboration,
    enterpriseJsonHeaders,
    buildCurrentProjectSnapshot,
    restoreProjectSnapshot,
    refreshEnterpriseState,
    refreshEnterpriseCollaboration,
    touchEnterprisePresence,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setActiveEnterpriseProjectId,
    setEnterpriseAnalysisRuns
  });

  const {
    exportPublication
  } = useEnterprisePublicationActions({
    enterpriseUserPresent: Boolean(enterpriseContext?.user),
    activeEnterpriseTeamId,
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    buildCurrentProjectSnapshot,
    setEnterpriseBusy,
    setEnterpriseMessage
  });

  const {
    exportProjectSnapshot
  } = useProjectSnapshotExportActions({
    buildCurrentProjectSnapshot,
    downloadText
  });

  const {
    exportEnaReport,
    exportMetricProvenance,
    exportPairReport,
    exportSocialReport
  } = useSenaReportExportActions({
    activeTemporalWindow,
    downloadText,
    model,
    reportTitle
  });

  const {
    exportEnaManifestJson,
    exportFusionMathAuditJson,
    exportRuntimeConsistencyAuditJson,
    exportSnaManifestJson
  } = useRuntimeManifestExportActions({
    downloadText,
    enaManifest,
    fusionMathAudit,
    runtimeConsistencyAudit,
    snaManifest
  });

  const {
    exportRuntimeBundleJson
  } = useRuntimeBundleExportActions({
    activeTemporalWindow,
    codingReliabilityReview,
    dataGovernanceReview,
    dataset,
    demoManualReviews,
    downloadText,
    interpretation,
    limitations,
    model,
    nextActions,
    reportTitle,
    reviewer,
    reviewStatus,
    temporalRuntimeTrace
  });

  const {
    exportTemporalRuntimeTraceJson
  } = useTemporalRuntimeTraceExportActions({
    buildOptions,
    dataset,
    downloadText,
    timelineModel
  });

  const {
    exportMethodProtocolJson,
    exportVisualGrammarJson
  } = useMethodArtifactExportActions({
    activeTemporalWindow,
    downloadText,
    model,
    reportTitle
  });

  const {
    exportDataContractAuditJson,
    exportEnterpriseCleaningManifestJson,
    exportEnterpriseValidationParityEvidenceJson
  } = useDataContractEvidenceExportActions({
    downloadText,
    latestEnterpriseValidationRun,
    latestImportCleaningManifest,
    setEnterpriseMessage,
    sourceDataContractAudit
  });

  const {
    exportClaimReadinessJson,
    exportCodingReliabilityJson,
    exportDemoVerificationCompatibilityJson,
    exportDemoVerificationJson,
    exportDemoWalkthroughJson,
    exportDevelopmentPlanJson,
    exportEvidenceLedgerJson,
    exportLocalValidationResultJson,
    exportPilotReadinessJson,
    exportProductionPageContractJson,
    exportReliabilityDashboardJson,
    exportReportJson,
    exportReportMarkdown,
    exportReviewPacketJson,
    exportValidationPreregistrationPlanJson
  } = useReportAndEvidenceArtifactExportActions({
    activeTemporalWindow,
    claimReadinessGate,
    codingReliabilityReview,
    dataGovernanceReview,
    dataset,
    demoManualReviews,
    downloadText,
    interpretation,
    latestReliabilityDashboard,
    latestValidationPreregistrationPlan,
    latestValidationResult,
    limitations,
    localEnterpriseValidationResult,
    model,
    nextActions,
    pilotReadinessAudit,
    reportTitle,
    reviewer,
    reviewStatus,
    setEnterpriseMessage,
    temporalRuntimeTrace
  });

  useEffect(() => {
    void refreshEnterpriseState();
  }, [refreshEnterpriseState]);

  useEnterpriseCollaborationEffects({
    activeEnterpriseProjectId,
    enterpriseUserId,
    workspaceRailMode,
    activePlotView,
    enterpriseJsonHeaders,
    setEnterpriseCollaboration,
    setEnterpriseCollaborationTransport
  });

  useTemporalAnimationEffects({
    dataset,
    temporalMode,
    movingWindowSize,
    movingWindowStep,
    turnWindowRadius,
    pendingActiveWindow,
    temporalWindows,
    isAnimating,
    animationMs,
    setActiveWindowIndex,
    setIsAnimating,
    setPendingActiveWindow
  });

  const {
    closeFusionPlotMaximized,
    maximizeFusionPlot,
    resetFusionPlotZoom,
    toggleLayer,
    zoomInFusionPlot,
    zoomOutFusionPlot
  } = useFusionPlotInteractions({
    isFusionPlotMaximized,
    setIsFusionPlotMaximized,
    setFusionPlotZoom,
    setLayers
  });

  const {
    applyDemoVerificationManualReviews,
    updateDemoManualReview
  } = useDemoVerificationManualReviewActions({
    model,
    setDemoManualReviews,
    setImportError,
    setImportMessage
  });

  const {
    applyMappedTables,
    clearContract,
    commitUploadedTables,
    exportContractTemplate,
    loadLessonStudySample,
    updateTableContract,
    updateTableField
  } = useDataImportMappedTableActions({
    downloadText,
    uploadedTables,
    setDataset,
    setUploadedTables,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setInterpretation,
    setIsLoadingSample,
    setLimitations,
    setNextActions,
    setReportTitle,
    setReviewer,
    setReviewStatus,
    setSelectedId,
    setWorkspaceRailMode
  });

  const {
    handleContractUpload
  } = useContractUploadAction({
    applyDemoVerificationManualReviews,
    commitUploadedTables,
    importFilesViaEnterpriseApi,
    restoreProjectSnapshot,
    setDataset,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setUploadedTables,
    setWorkspaceRailMode,
    uploadedTables
  });

  const enterpriseRuntimeSectionProps = buildWorkspaceEnterpriseRuntimeContainerProps({
    busy: enterpriseBusy,
    enterpriseContext,
    enterpriseMessage,
    latestEnterpriseValidationRun,
    onExportEnterpriseExpertReviewDossierJson: exportEnterpriseExpertReviewDossierJson,
    onExportEnterpriseValidationParityEvidenceJson: exportEnterpriseValidationParityEvidenceJson,
    validationGroupField,
    validationGroupValues,
    selectedValidationGroupA,
    selectedValidationGroupB,
    validationMetric,
    validationPreregistrationNote,
    validationMethodNote,
    validationStudySpecificInferenceReference,
    localEnterpriseValidationResult,
    latestValidationResult,
    latestValidationPreregistrationPlan,
    onValidationGroupFieldChange: (value: typeof validationGroupField) => {
      setValidationGroupField(value);
      setValidationGroupA("");
      setValidationGroupB("");
    },
    onValidationGroupAChange: setValidationGroupA,
    onValidationGroupBChange: setValidationGroupB,
    onValidationMetricChange: setValidationMetric,
    onValidationPreregistrationNoteChange: setValidationPreregistrationNote,
    onValidationMethodNoteChange: setValidationMethodNote,
    onValidationStudySpecificInferenceReferenceChange: setValidationStudySpecificInferenceReference,
    onRunEnterpriseValidationComparison: runEnterpriseValidationComparison,
    onExportLocalValidationResultJson: exportLocalValidationResultJson,
    onExportValidationPreregistrationPlanJson: exportValidationPreregistrationPlanJson,
    activeEnterpriseProjectId,
    enterpriseProjects,
    onProjectChange: (projectId: string) => {
      setActiveEnterpriseProjectId(projectId);
      void openEnterpriseProject(projectId);
    },
    onSaveEnterpriseProject: saveEnterpriseProject,
    onRunEnterpriseAnalysis: runEnterpriseAnalysis,
    onRefreshEnterpriseState: refreshEnterpriseState,
    onExportEnterpriseCleaningManifestJson: exportEnterpriseCleaningManifestJson,
    enterpriseTeamState,
    enterpriseNotifications,
    unreadEnterpriseNotificationCount,
    onExportGovernanceHealthJson: exportEnterpriseGovernanceHealthJson,
    onExportSecurityPostureJson: exportEnterpriseSecurityPostureJson,
    onExportAuditCsv: exportEnterpriseAuditCsv,
    onExportBackupJson: exportEnterpriseBackupJson,
    onDeliverAuditLog: deliverEnterpriseAuditLogFromWorkspace,
    onDeliverBackup: deliverEnterpriseBackupFromWorkspace,
    onSyncDatabase: syncEnterpriseDatabaseFromWorkspace,
    onRefreshNotifications: refreshEnterpriseTeamState,
    onDeliverNotifications: deliverEnterpriseNotifications,
    onDeliverEmails: deliverEnterpriseEmailsFromWorkspace,
    onMarkNotificationRead: markEnterpriseNotificationReadFromWorkspace,
    canSubmitAttestation: Boolean(activeEnterpriseTeamId && releaseGateApproverName.trim() && releaseGateNotes.trim()),
    onExportOpsStatusJson: exportEnterpriseOpsStatusJson,
    onExportOpsReadinessJson: exportEnterpriseOpsReadinessJson,
    onExportDeploymentPackageJson: exportEnterpriseDeploymentPackageJson,
    onExportCapabilityAuditJson: exportEnterpriseCapabilityAuditJson,
    onExportIdentityProductionEvidenceJson: exportEnterpriseIdentityProductionEvidenceJson,
    onExportSaasOperationsReadinessJson: exportEnterpriseSaasOperationsReadinessJson,
    onExportGoLiveRehearsalJson: exportEnterpriseGoLiveRehearsalJson,
    onExportGoLiveRollbackDrillJson: exportEnterpriseGoLiveRollbackDrillJson,
    onExportGoLiveMonitorJson: exportEnterpriseGoLiveMonitorJson,
    onApplyGoLiveRehearsalDraft: applyEnterpriseGoLiveRehearsalDraft,
    onSubmitGoLiveAttestation: submitEnterpriseGoLiveAttestation,
    onExportGoLiveAttestationsJson: exportEnterpriseGoLiveAttestationsJson,
    onExportReleaseGateReviewsJson: exportEnterpriseReleaseGateReviewsJson,
    onExportOpsAlertsJson: exportEnterpriseOpsAlertsJson,
    onDeliverOpsAlerts: deliverEnterpriseOpsAlertsFromWorkspace,
    enterpriseUploadStorage,
    enterpriseUploadVerification,
    enterpriseUploads,
    latestEnterpriseUpload,
    fileAccept: senaEnterpriseImportFileAccept,
    onFileInputChange: createEnterpriseUploadRegistryFiles,
    onRefreshUploadStorage: refreshEnterpriseUploadStorage,
    onDeliverUploadObjectStorage: deliverEnterpriseUploadObjectStorage,
    enterpriseCollaboration,
    enterpriseCollaborationTransport,
    enterpriseSsoPreflight,
    onDeliverCollaborationPubSub: deliverEnterpriseCollaborationPubSubFromWorkspace,
    onRunSsoPreflight: runEnterpriseSsoPreflightFromWorkspace,
    enterpriseDeploymentPackage,
    identityProductionHandoff,
    platformRequestPacket,
    institutionActionPlan,
    identityCutoverChecklist,
    provisioningDeploymentEnv,
    provisioningServiceEndpoints,
    identityProductionServiceEndpoint,
    provisioningOwnerDecision,
    provisioningGovernanceCheck,
    onRefreshProvisioningReadiness: refreshEnterpriseProvisioningReadiness,
    onApplyIdentityRequestToPlatformDecision: applyEnterpriseIdentityRequestToPlatformDecision,
    enterpriseMfaStatus,
    enterpriseMfaSetup,
    enterpriseMfaEnableCode,
    enterpriseMfaDisableCode,
    enterpriseSessionList,
    onStartMfaSetup: startEnterpriseMfaSetup,
    onLogoutSession: logoutEnterpriseSessionFromWorkspace,
    onMfaEnableCodeChange: setEnterpriseMfaEnableCode,
    onEnableMfa: enableEnterpriseMfaFromSetup,
    onMfaDisableCodeChange: setEnterpriseMfaDisableCode,
    onDisableMfa: disableEnterpriseMfaFromCode,
    onRefreshSessionList: refreshEnterpriseSessionList,
    onRevokeSession: revokeEnterpriseSession,
    enterpriseUserId,
    enterpriseTeamMemberships,
    pendingEnterpriseInvitations,
    teamInviteEmail,
    teamInviteRole,
    teamInviteCode,
    onTeamInviteEmailChange: setTeamInviteEmail,
    onTeamInviteRoleChange: setTeamInviteRole,
    onTeamInviteCodeChange: setTeamInviteCode,
    onRefreshTeamState: refreshEnterpriseTeamState,
    onCreateTeamInvitation: createTeamInvitation,
    onAcceptTeamInvitation: acceptTeamInvitation,
    onUpdateTeamMembership: updateTeamMembership,
    onRevokeTeamInvitation: revokeTeamInvitation,
    enterprisePlatformDecisionState,
    selectedPlatformDecision,
    selectedPlatformDecisionProductionEvidenceItems,
    latestPlatformDecisionAcceptance,
    platformDecisionId,
    platformDecisionStatus,
    platformDecisionAcceptBridge,
    platformDecisionOwnerName,
    platformDecisionOwnerRole,
    platformDecisionEnvironment,
    platformDecisionEvidenceUrl,
    platformDecisionProductionEvidenceIds,
    platformDecisionProductionEvidenceVerifiedAt,
    platformDecisionNotes,
    platformDecisionRequiresIdentityEvidenceUrl,
    platformDecisionRequiresIdentityEvidenceTimestamp,
    onRefreshPlatformDecisionState: refreshEnterprisePlatformDecisionState,
    onExportPlatformDecisionRegisterJson: exportEnterprisePlatformDecisionRegisterJson,
    onExportNativeAdapterCertificationJson: exportEnterpriseNativeAdapterCertificationJson,
    onPlatformDecisionIdChange: (value: EnterprisePlatformDecisionId) => {
      setPlatformDecisionId(value);
      setPlatformDecisionProductionEvidenceIds([]);
    },
    onPlatformDecisionStatusChange: setPlatformDecisionStatus,
    onPlatformDecisionAcceptBridgeChange: setPlatformDecisionAcceptBridge,
    onPlatformDecisionOwnerNameChange: setPlatformDecisionOwnerName,
    onPlatformDecisionOwnerRoleChange: setPlatformDecisionOwnerRole,
    onPlatformDecisionEnvironmentChange: setPlatformDecisionEnvironment,
    onPlatformDecisionEvidenceUrlChange: setPlatformDecisionEvidenceUrl,
    onPlatformDecisionProductionEvidenceIdsChange: setPlatformDecisionProductionEvidenceIds,
    onPlatformDecisionProductionEvidenceVerifiedAtChange: setPlatformDecisionProductionEvidenceVerifiedAt,
    onPlatformDecisionNotesChange: setPlatformDecisionNotes,
    onSubmitPlatformDecisionReview: submitEnterprisePlatformDecisionReview,
    enterpriseReleaseGateState,
    latestReleaseGateReview,
    latestReleaseGateIdentitySnapshot,
    releaseGateDecision,
    releaseGateVersion,
    releaseGateEnvironment,
    releaseGateApproverName,
    releaseGateApproverRole,
    releaseGateNotes,
    releaseGateVerificationStatus,
    releaseGateVerificationSummary,
    releaseGateVerificationHash,
    onReleaseGateDecisionChange: setReleaseGateDecision,
    onReleaseGateVersionChange: setReleaseGateVersion,
    onReleaseGateEnvironmentChange: setReleaseGateEnvironment,
    onReleaseGateApproverNameChange: setReleaseGateApproverName,
    onReleaseGateApproverRoleChange: setReleaseGateApproverRole,
    onReleaseGateNotesChange: setReleaseGateNotes,
    onReleaseGateVerificationStatusChange: setReleaseGateVerificationStatus,
    onReleaseGateVerificationSummaryChange: setReleaseGateVerificationSummary,
    onReleaseGateVerificationHashChange: setReleaseGateVerificationHash,
    onRefreshReleaseGateReviews: refreshEnterpriseReleaseGateReviews,
    onSubmitReleaseGateReview: submitEnterpriseReleaseGateReview,
    enterpriseClaimPackage,
    latestEnterpriseAnalysisRun,
    latestEnterpriseImportRun,
    enterpriseComment,
    reliabilityReviewNote,
    validationReviewNote,
    expertReviewerName,
    expertExpertiseArea,
    expertClaimScope,
    expertDataAdequacy,
    expertMethodFit,
    expertInterpretationValidity,
    expertConcerns,
    expertRecommendations,
    adjudicationItemId,
    adjudicationCodeId,
    adjudicationDecision,
    adjudicationNotesQuick,
    onEnterpriseCommentChange: setEnterpriseComment,
    onReliabilityReviewNoteChange: setReliabilityReviewNote,
    onValidationReviewNoteChange: setValidationReviewNote,
    onExpertReviewerNameChange: setExpertReviewerName,
    onExpertExpertiseAreaChange: setExpertExpertiseArea,
    onExpertClaimScopeChange: setExpertClaimScope,
    onExpertDataAdequacyChange: setExpertDataAdequacy,
    onExpertMethodFitChange: setExpertMethodFit,
    onExpertInterpretationValidityChange: setExpertInterpretationValidity,
    onExpertConcernsChange: setExpertConcerns,
    onExpertRecommendationsChange: setExpertRecommendations,
    onAdjudicationItemIdChange: setAdjudicationItemId,
    onAdjudicationCodeIdChange: setAdjudicationCodeId,
    onAdjudicationDecisionChange: setAdjudicationDecision,
    onAdjudicationNotesQuickChange: setAdjudicationNotesQuick,
    onTouchEnterprisePresence: touchEnterprisePresence,
    onRefreshEnterpriseCollaboration: refreshEnterpriseCollaboration,
    onRestoreEnterpriseProjectRevision: restoreEnterpriseProjectRevision,
    onAddEnterpriseComment: addEnterpriseComment,
    onReviewEnterpriseReliabilityRun: reviewEnterpriseReliabilityRun,
    onReviewEnterpriseValidationRun: reviewEnterpriseValidationRun,
    onSubmitEnterpriseExpertReview: submitEnterpriseExpertReview,
    onUpdateEnterpriseExpertReview: updateEnterpriseExpertReview,
    onAddEnterpriseAdjudication: addEnterpriseAdjudication
  });

  const {
    headerProps: workspaceHeaderProps,
    leftRailProps: workspaceLeftRailProps
  } = buildWorkspaceHeaderLeftRailContainerProps({
    activePlotView,
    activeRailPanel,
    alpha,
    audit: sourceDataContractAudit,
    beta,
    dataset,
    enaManifest,
    enterpriseRuntimeProps: enterpriseRuntimeSectionProps,
    fileAccept: senaEnterpriseImportFileAccept,
    gamma,
    icon: StatsNetworkMetricsIcon,
    importError,
    importMessage,
    isAdvancedOpen: isPlotToolsAdvancedOpen,
    isLoadingSample,
    layerCopy,
    layers,
    layout,
    layoutOptions,
    methodProtocol,
    methodValidation,
    model,
    normalization,
    onAdvancedToggle: () => setIsPlotToolsAdvancedOpen((current) => !current),
    onAlphaChange: setAlpha,
    onBetaChange: setBeta,
    onClearContract: clearContract,
    onContractUpload: handleContractUpload,
    onExport: exportDataContractAuditJson,
    onExportContractTemplate: exportContractTemplate,
    onExportEnaManifestJson: exportEnaManifestJson,
    onExportMethodProtocol: exportMethodProtocolJson,
    onExportMetricProvenance: exportMetricProvenance,
    onExportPairReport: exportPairReport,
    onExportReportMarkdown: exportReportMarkdown,
    onExportSnaManifestJson: exportSnaManifestJson,
    onExportSocialReport: exportSocialReport,
    onFieldChange: updateTableField,
    onGammaChange: setGamma,
    onLayerToggle: toggleLayer,
    onLayoutChange: setLayout,
    onLoadSample: loadLessonStudySample,
    onNormalizationChange: setNormalization,
    onSelect: setSelectedId,
    onTableChange: updateTableContract,
    onTemporalModeChange: setTemporalMode,
    onThresholdChange: setThreshold,
    plotViewOptions,
    reportReadyPercent,
    runtimeConsistencyAudit,
    snaManifest,
    temporalMode,
    temporalModeOptions,
    threshold,
    timelineModel,
    totalEvidenceRefs,
    uploadedTables,
    warnings: timelineModel.summary.warnings,
    workflowStepStates,
    workspaceRailMode
  });

  const workspaceReportAndStatsDeckProps = buildWorkspaceReportAndStatsDeckContainerProps({
    activeTemporalIndex,
    activeTemporalWindow,
    adjudicationNotes,
    agreementMetric,
    agreementValue,
    claimReadinessGate,
    coderCount,
    codingReliabilityGate,
    codingReliabilityReviewer,
    codingReliabilityStatus,
    codingScheme,
    completenessAudit: reportCompletenessAudit,
    dataGovernanceConsentScope,
    dataGovernanceDataSteward,
    dataGovernanceIrbApprovalId,
    dataGovernanceRetentionPolicy,
    dataGovernanceUsageConstraints,
    demoVerification: demoVerificationPreview,
    demoVerificationCompatibilityAudit: demoVerificationCompatibilityAuditPreview,
    developmentPlan,
    enaManifest,
    evidenceLedger,
    evidenceSourceFilter,
    hasReliabilityDashboard: Boolean(latestReliabilityDashboard),
    interpretation,
    limitations,
    methodValidation,
    model,
    nextActions,
    onAdjudicationNotesChange: setAdjudicationNotes,
    onAgreementMetricChange: setAgreementMetric,
    onAgreementValueChange: setAgreementValue,
    onCoderCountChange: setCoderCount,
    onCodingReliabilityReviewerChange: setCodingReliabilityReviewer,
    onCodingReliabilityStatusChange: setCodingReliabilityStatus,
    onCodingSchemeChange: setCodingScheme,
    onDataGovernanceConsentScopeChange: setDataGovernanceConsentScope,
    onDataGovernanceDataStewardChange: setDataGovernanceDataSteward,
    onDataGovernanceIrbApprovalIdChange: setDataGovernanceIrbApprovalId,
    onDataGovernanceRetentionPolicyChange: setDataGovernanceRetentionPolicy,
    onDataGovernanceUsageConstraintsChange: setDataGovernanceUsageConstraints,
    onDemoManualReviewChange: updateDemoManualReview,
    onEvidenceSourceFilterChange: setEvidenceSourceFilter,
    onExportClaimReadinessJson: exportClaimReadinessJson,
    onExportCodingReliabilityJson: exportCodingReliabilityJson,
    onExportDevelopmentPlanJson: exportDevelopmentPlanJson,
    onExportEnaReport: exportEnaReport,
    onExportEvidenceLedgerJson: exportEvidenceLedgerJson,
    onExportJson: exportReportJson,
    onExportMarkdown: exportReportMarkdown,
    onExportPairReport: exportPairReport,
    onExportProductionPageContractJson: exportProductionPageContractJson,
    onExportProjectSnapshot: exportProjectSnapshot,
    onExportPublication: exportPublication,
    onExportReadinessJson: exportPilotReadinessJson,
    onExportReliabilityDashboardJson: exportReliabilityDashboardJson,
    onExportReviewPacket: exportReviewPacketJson,
    onExportRuntimeBundleJson: exportRuntimeBundleJson,
    onExportRuntimeConsistencyAuditJson: exportRuntimeConsistencyAuditJson,
    onExportSocialReport: exportSocialReport,
    onExportTemporalRuntimeTraceJson: exportTemporalRuntimeTraceJson,
    onExportVerificationCompatibilityJson: exportDemoVerificationCompatibilityJson,
    onExportVerificationJson: exportDemoVerificationJson,
    onExportWalkthroughJson: exportDemoWalkthroughJson,
    onInterpretationChange: setInterpretation,
    onLimitationsChange: setLimitations,
    onNextActionsChange: setNextActions,
    onReliabilityLimitationsChange: setReliabilityLimitations,
    onReliabilityUpload: handleReliabilityUpload,
    onReportTitleChange: setReportTitle,
    onReviewStatusChange: setReviewStatus,
    onReviewerChange: setReviewer,
    onUnitOfCodingChange: setUnitOfCoding,
    pilotReadinessAudit,
    productionPageContract,
    reliabilityLimitations,
    reportTitle,
    reviewPacketAudit,
    reviewStatus,
    reviewer,
    snaManifest,
    temporalRuntimeTrace,
    unitOfCoding,
    windowCount: temporalWindows.length
  });

  const workspaceCentralPlotDeckProps = buildWorkspaceCentralPlotDeckContainerProps({
    activeTemporalIndex,
    onActiveTemporalIndexChange: setActiveWindowIndex,
    temporalWindows,
    temporalMode,
    onTemporalModeChange: setTemporalMode,
    movingWindowSize,
    onMovingWindowSizeChange: setMovingWindowSize,
    movingWindowStep,
    onMovingWindowStepChange: setMovingWindowStep,
    turnWindowRadius,
    onTurnWindowRadiusChange: setTurnWindowRadius,
    temporalRuntimeTrace,
    isAnimating,
    onAnimationToggle: () => setIsAnimating((current) => !current),
    animationMs,
    onAnimationMsChange: setAnimationMs,
    fusionMathAudit,
    activeTransition: activeTemporalTransition,
    activeWindowBrief,
    evidenceLedger,
    evidenceSourceFilter,
    onEvidenceSourceFilterChange: setEvidenceSourceFilter,
    onExportEvidenceLedgerJson: exportEvidenceLedgerJson,
    activeTemporalWindow,
    isWorkspaceDataViewOpen,
    onWorkspaceDataViewToggle: () => setIsWorkspaceDataViewOpen((current) => !current),
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange: setJointEmbeddingOperator,
    selectedId: selected?.id ?? "",
    revealedLabelIds: revealedNodeLabelIds,
    onCanvasSelect: handleCanvasSelect,
    fusionPlotZoom,
    onZoomIn: zoomInFusionPlot,
    onZoomOut: zoomOutFusionPlot,
    onZoomReset: resetFusionPlotZoom,
    onMaximizeFusionPlot: () => {
      setActivePlotView("fusion");
      maximizeFusionPlot();
    },
    activePlotView,
    isPlotSwitcherOpen,
    onPlotSwitcherToggle: () => setIsPlotSwitcherOpen((current) => !current),
    onPlotViewSelect: (view) => {
      setActivePlotView(view);
      setIsPlotSwitcherOpen(false);
    },
    plotViewOptions,
    model,
    layout,
    enaManifest,
    snaManifest,
    layers,
    threshold,
    alpha,
    beta,
    gamma
  });

  const workspaceRightInspectorProps = buildWorkspaceRightInspectorContainerProps({
    layout,
    selectedLayoutNote: selectedLayout.note,
    onLayoutChange: setLayout,
    layoutOptions,
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange: setJointEmbeddingOperator,
    fusionMathAudit,
    visibleEdgeStrokeScale,
    jenaConceptPairHandoffRows,
    jsnaSocialTieHandoffRows,
    showArchivedFormulaPanel: SHOW_ARCHIVED_FORMULA_PANEL,
    onExportMathAudit: exportFusionMathAuditJson,
    onExportMethodProtocol: exportMethodProtocolJson,
    onExportVisualGrammar: exportVisualGrammarJson,
    model,
    timelineModel,
    enaManifest,
    layers,
    layerCopy,
    threshold,
    alpha,
    beta,
    gamma,
    activeTemporalWindow,
    selected,
    selectedId,
    revealedLabelIds: revealedNodeLabelIds,
    onCanvasSelect: handleCanvasSelect
  });

  const workspaceMainShellSectionProps = buildWorkspaceFusionOverlayRailMainShellContainerProps({
    selectedId: selected?.id ?? "",
    revealedLabelIds: revealedNodeLabelIds,
    onSelect: handleCanvasSelect,
    onClose: closeFusionPlotMaximized,
    model,
    layout,
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange: setJointEmbeddingOperator,
    enaManifest,
    layers,
    threshold,
    activeWindowLabel,
    activeTurnLabel,
    alpha,
    beta,
    gamma,
    zoom: fusionPlotZoom,
    onZoomIn: zoomInFusionPlot,
    onZoomOut: zoomOutFusionPlot,
    onZoomReset: resetFusionPlotZoom,
    active: workspaceRailMode,
    onWorkspaceRailModeChange: setWorkspaceRailMode,
    onPlotSwitcherOpenChange: setIsPlotSwitcherOpen,
    onActivePlotViewChange: setActivePlotView,
    items: workspaceRailItems,
    isFusionPlotMaximized,
    headerProps: workspaceHeaderProps,
    plotViewBarProps: {
      active: activePlotView,
      isOpen: isPlotSwitcherOpen,
      onToggle: () => setIsPlotSwitcherOpen((current) => !current),
      onSelect: (view) => {
        setActivePlotView(view);
        setIsPlotSwitcherOpen(false);
      },
      plotViewOptions,
      activeWindowLabel,
      activeTurnLabel
    },
    leftRailProps: workspaceLeftRailProps,
    centralPlotDeckProps: workspaceCentralPlotDeckProps,
    rightInspectorProps: workspaceRightInspectorProps,
    reportAndStatsDeckProps: workspaceReportAndStatsDeckProps,
  });

  return workspaceMainShellSectionProps;
}
