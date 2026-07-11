import {
  EnterpriseAccountSecurityPanel,
  type EnterpriseAccountSecurityPanelProps
} from "./enterprise-account-security-panel";
import {
  EnterpriseCollaborationProjectPanel,
  type EnterpriseCollaborationProjectPanelProps
} from "./enterprise-collaboration-project-panel";
import {
  EnterpriseCollaborationSsoPanel,
  type EnterpriseCollaborationSsoPanelProps
} from "./enterprise-collaboration-sso-panel";
import {
  EnterpriseGovernanceNotificationsPanel,
  type EnterpriseGovernanceNotificationsPanelProps
} from "./enterprise-governance-notifications-panel";
import {
  EnterpriseLocalValidationPanel,
  type EnterpriseLocalValidationPanelProps
} from "./enterprise-local-validation-panel";
import {
  EnterpriseOpsExports,
  type EnterpriseOpsExportsProps
} from "./enterprise-ops-exports";
import {
  EnterprisePlatformDecisionPanel,
  type EnterprisePlatformDecisionPanelProps
} from "./enterprise-platform-decision-panel";
import {
  EnterpriseProvisioningReadinessPanel,
  type EnterpriseProvisioningReadinessPanelProps
} from "./enterprise-provisioning-readiness-panel";
import {
  EnterpriseReleaseGatePanel,
  type EnterpriseReleaseGatePanelProps
} from "./enterprise-release-gate-panel";
import {
  EnterpriseRuntimeHeaderPanel,
  type EnterpriseRuntimeHeaderPanelProps
} from "./enterprise-runtime-header-panel";
import {
  EnterpriseServerProjectControlsPanel,
  type EnterpriseServerProjectControlsPanelProps
} from "./enterprise-server-project-controls-panel";
import {
  EnterpriseTeamOperationsPanel,
  type EnterpriseTeamOperationsPanelProps
} from "./enterprise-team-operations-panel";
import {
  EnterpriseUploadStoragePanel,
  type EnterpriseUploadStoragePanelProps
} from "./enterprise-upload-storage-panel";

export type EnterpriseRuntimePanelProps = {
  enterpriseMessage: string;
  canSubmitAttestation: boolean;
} & EnterpriseRuntimeHeaderPanelProps
  & EnterpriseLocalValidationPanelProps
  & Omit<EnterpriseServerProjectControlsPanelProps, "hasUser">
  & Omit<EnterpriseGovernanceNotificationsPanelProps, "disabled">
  & Omit<EnterpriseOpsExportsProps, "disabled">
  & Omit<EnterpriseUploadStoragePanelProps, "disabled">
  & Omit<EnterpriseCollaborationSsoPanelProps, "disabled" | "hasActiveProject">
  & Omit<EnterpriseProvisioningReadinessPanelProps, "disabled">
  & Omit<EnterpriseAccountSecurityPanelProps, "disabled" | "hasUser">
  & Omit<EnterpriseTeamOperationsPanelProps, "disabled">
  & Omit<EnterprisePlatformDecisionPanelProps, "disabled">
  & Omit<EnterpriseReleaseGatePanelProps, "disabled" | "canSubmitReview" | "platformBlockers">
  & Omit<EnterpriseCollaborationProjectPanelProps, "disabled">;

export function EnterpriseRuntimePanel(props: EnterpriseRuntimePanelProps) {
  const hasUser = Boolean(props.enterpriseContext?.user);
  const disabled = !hasUser || props.busy;
  const hasActiveProject = Boolean(props.activeEnterpriseProjectId);
  const canSubmitReview = Boolean(
    props.releaseGateApproverName.trim()
    && props.releaseGateNotes.trim()
    && props.releaseGateVerificationSummary.trim()
  );
  const platformBlockers = props.enterpriseDeploymentPackage?.platformDecisionRegister.summary.productionBlocking ?? 0;

  return (
    <div data-testid="enterprise-runtime-panel" className="grid gap-3 rounded-lg border border-cyanGlow/30 bg-cyanGlow/10 p-3">
      <EnterpriseRuntimeHeaderPanel
        busy={props.busy}
        enterpriseContext={props.enterpriseContext}
        latestEnterpriseValidationRun={props.latestEnterpriseValidationRun}
        onExportEnterpriseExpertReviewDossierJson={props.onExportEnterpriseExpertReviewDossierJson}
        onExportEnterpriseValidationParityEvidenceJson={props.onExportEnterpriseValidationParityEvidenceJson}
      />
      <EnterpriseLocalValidationPanel
        busy={props.busy}
        validationGroupField={props.validationGroupField}
        validationGroupValues={props.validationGroupValues}
        selectedValidationGroupA={props.selectedValidationGroupA}
        selectedValidationGroupB={props.selectedValidationGroupB}
        validationMetric={props.validationMetric}
        validationPreregistrationNote={props.validationPreregistrationNote}
        validationMethodNote={props.validationMethodNote}
        validationStudySpecificInferenceReference={props.validationStudySpecificInferenceReference}
        localEnterpriseValidationResult={props.localEnterpriseValidationResult}
        latestValidationResult={props.latestValidationResult}
        latestValidationPreregistrationPlan={props.latestValidationPreregistrationPlan}
        onValidationGroupFieldChange={props.onValidationGroupFieldChange}
        onValidationGroupAChange={props.onValidationGroupAChange}
        onValidationGroupBChange={props.onValidationGroupBChange}
        onValidationMetricChange={props.onValidationMetricChange}
        onValidationPreregistrationNoteChange={props.onValidationPreregistrationNoteChange}
        onValidationMethodNoteChange={props.onValidationMethodNoteChange}
        onValidationStudySpecificInferenceReferenceChange={props.onValidationStudySpecificInferenceReferenceChange}
        onRunEnterpriseValidationComparison={props.onRunEnterpriseValidationComparison}
        onExportLocalValidationResultJson={props.onExportLocalValidationResultJson}
        onExportValidationPreregistrationPlanJson={props.onExportValidationPreregistrationPlanJson}
      />
      <EnterpriseServerProjectControlsPanel
        activeEnterpriseProjectId={props.activeEnterpriseProjectId}
        busy={props.busy}
        hasUser={hasUser}
        enterpriseProjects={props.enterpriseProjects}
        onProjectChange={props.onProjectChange}
        onSaveEnterpriseProject={props.onSaveEnterpriseProject}
        onRunEnterpriseAnalysis={props.onRunEnterpriseAnalysis}
        onRefreshEnterpriseState={props.onRefreshEnterpriseState}
        onExportEnterpriseCleaningManifestJson={props.onExportEnterpriseCleaningManifestJson}
      />
      <div className="text-xs font-semibold leading-5 text-muted">{props.enterpriseMessage}</div>
      <EnterpriseGovernanceNotificationsPanel
        disabled={disabled}
        busy={props.busy}
        enterpriseTeamState={props.enterpriseTeamState}
        enterpriseNotifications={props.enterpriseNotifications}
        unreadEnterpriseNotificationCount={props.unreadEnterpriseNotificationCount}
        onExportGovernanceHealthJson={props.onExportGovernanceHealthJson}
        onExportSecurityPostureJson={props.onExportSecurityPostureJson}
        onExportAuditCsv={props.onExportAuditCsv}
        onExportBackupJson={props.onExportBackupJson}
        onDeliverAuditLog={props.onDeliverAuditLog}
        onDeliverBackup={props.onDeliverBackup}
        onSyncDatabase={props.onSyncDatabase}
        onRefreshNotifications={props.onRefreshNotifications}
        onDeliverNotifications={props.onDeliverNotifications}
        onDeliverEmails={props.onDeliverEmails}
        onMarkNotificationRead={props.onMarkNotificationRead}
      />
      <EnterpriseOpsExports
        disabled={disabled}
        canSubmitAttestation={props.canSubmitAttestation}
        onExportOpsStatusJson={props.onExportOpsStatusJson}
        onExportOpsReadinessJson={props.onExportOpsReadinessJson}
        onExportDeploymentPackageJson={props.onExportDeploymentPackageJson}
        onExportCapabilityAuditJson={props.onExportCapabilityAuditJson}
        onExportIdentityProductionEvidenceJson={props.onExportIdentityProductionEvidenceJson}
        onExportSaasOperationsReadinessJson={props.onExportSaasOperationsReadinessJson}
        onExportGoLiveRehearsalJson={props.onExportGoLiveRehearsalJson}
        onExportGoLiveRollbackDrillJson={props.onExportGoLiveRollbackDrillJson}
        onExportGoLiveMonitorJson={props.onExportGoLiveMonitorJson}
        onApplyGoLiveRehearsalDraft={props.onApplyGoLiveRehearsalDraft}
        onSubmitGoLiveAttestation={props.onSubmitGoLiveAttestation}
        onExportGoLiveAttestationsJson={props.onExportGoLiveAttestationsJson}
        onExportReleaseGateReviewsJson={props.onExportReleaseGateReviewsJson}
        onExportOpsAlertsJson={props.onExportOpsAlertsJson}
        onDeliverOpsAlerts={props.onDeliverOpsAlerts}
      />
      <EnterpriseUploadStoragePanel
        disabled={disabled}
        enterpriseUploadStorage={props.enterpriseUploadStorage}
        enterpriseUploadVerification={props.enterpriseUploadVerification}
        enterpriseUploads={props.enterpriseUploads}
        latestEnterpriseUpload={props.latestEnterpriseUpload}
        fileAccept={props.fileAccept}
        onFileInputChange={props.onFileInputChange}
        onRefreshUploadStorage={props.onRefreshUploadStorage}
        onDeliverUploadObjectStorage={props.onDeliverUploadObjectStorage}
      />
      <EnterpriseCollaborationSsoPanel
        disabled={disabled}
        hasActiveProject={hasActiveProject}
        enterpriseCollaboration={props.enterpriseCollaboration}
        enterpriseCollaborationTransport={props.enterpriseCollaborationTransport}
        enterpriseSsoPreflight={props.enterpriseSsoPreflight}
        onDeliverCollaborationPubSub={props.onDeliverCollaborationPubSub}
        onRunSsoPreflight={props.onRunSsoPreflight}
      />
      <EnterpriseProvisioningReadinessPanel
        disabled={disabled}
        enterpriseDeploymentPackage={props.enterpriseDeploymentPackage}
        identityProductionHandoff={props.identityProductionHandoff}
        platformRequestPacket={props.platformRequestPacket}
        institutionActionPlan={props.institutionActionPlan}
        identityCutoverChecklist={props.identityCutoverChecklist}
        provisioningDeploymentEnv={props.provisioningDeploymentEnv}
        provisioningServiceEndpoints={props.provisioningServiceEndpoints}
        identityProductionServiceEndpoint={props.identityProductionServiceEndpoint}
        provisioningOwnerDecision={props.provisioningOwnerDecision}
        provisioningGovernanceCheck={props.provisioningGovernanceCheck}
        onRefreshProvisioningReadiness={props.onRefreshProvisioningReadiness}
        onApplyIdentityRequestToPlatformDecision={props.onApplyIdentityRequestToPlatformDecision}
      />
      <EnterpriseAccountSecurityPanel
        disabled={disabled}
        busy={props.busy}
        hasUser={hasUser}
        enterpriseMfaStatus={props.enterpriseMfaStatus}
        enterpriseMfaSetup={props.enterpriseMfaSetup}
        enterpriseMfaEnableCode={props.enterpriseMfaEnableCode}
        enterpriseMfaDisableCode={props.enterpriseMfaDisableCode}
        enterpriseSessionList={props.enterpriseSessionList}
        onStartMfaSetup={props.onStartMfaSetup}
        onLogoutSession={props.onLogoutSession}
        onMfaEnableCodeChange={props.onMfaEnableCodeChange}
        onEnableMfa={props.onEnableMfa}
        onMfaDisableCodeChange={props.onMfaDisableCodeChange}
        onDisableMfa={props.onDisableMfa}
        onRefreshSessionList={props.onRefreshSessionList}
        onRevokeSession={props.onRevokeSession}
      />
      <EnterpriseTeamOperationsPanel
        disabled={disabled}
        busy={props.busy}
        enterpriseUserId={props.enterpriseUserId}
        enterpriseTeamState={props.enterpriseTeamState}
        enterpriseTeamMemberships={props.enterpriseTeamMemberships}
        pendingEnterpriseInvitations={props.pendingEnterpriseInvitations}
        teamInviteEmail={props.teamInviteEmail}
        teamInviteRole={props.teamInviteRole}
        teamInviteCode={props.teamInviteCode}
        onTeamInviteEmailChange={props.onTeamInviteEmailChange}
        onTeamInviteRoleChange={props.onTeamInviteRoleChange}
        onTeamInviteCodeChange={props.onTeamInviteCodeChange}
        onRefreshTeamState={props.onRefreshTeamState}
        onCreateTeamInvitation={props.onCreateTeamInvitation}
        onAcceptTeamInvitation={props.onAcceptTeamInvitation}
        onUpdateTeamMembership={props.onUpdateTeamMembership}
        onRevokeTeamInvitation={props.onRevokeTeamInvitation}
      />
      <EnterprisePlatformDecisionPanel
        disabled={disabled}
        enterprisePlatformDecisionState={props.enterprisePlatformDecisionState}
        selectedPlatformDecision={props.selectedPlatformDecision}
        selectedPlatformDecisionProductionEvidenceItems={props.selectedPlatformDecisionProductionEvidenceItems}
        latestPlatformDecisionAcceptance={props.latestPlatformDecisionAcceptance}
        platformDecisionId={props.platformDecisionId}
        platformDecisionStatus={props.platformDecisionStatus}
        platformDecisionAcceptBridge={props.platformDecisionAcceptBridge}
        platformDecisionOwnerName={props.platformDecisionOwnerName}
        platformDecisionOwnerRole={props.platformDecisionOwnerRole}
        platformDecisionEnvironment={props.platformDecisionEnvironment}
        platformDecisionEvidenceUrl={props.platformDecisionEvidenceUrl}
        platformDecisionProductionEvidenceIds={props.platformDecisionProductionEvidenceIds}
        platformDecisionProductionEvidenceVerifiedAt={props.platformDecisionProductionEvidenceVerifiedAt}
        platformDecisionNotes={props.platformDecisionNotes}
        platformDecisionRequiresIdentityEvidenceUrl={props.platformDecisionRequiresIdentityEvidenceUrl}
        platformDecisionRequiresIdentityEvidenceTimestamp={props.platformDecisionRequiresIdentityEvidenceTimestamp}
        onRefreshPlatformDecisionState={props.onRefreshPlatformDecisionState}
        onExportPlatformDecisionRegisterJson={props.onExportPlatformDecisionRegisterJson}
        onExportNativeAdapterCertificationJson={props.onExportNativeAdapterCertificationJson}
        onPlatformDecisionIdChange={props.onPlatformDecisionIdChange}
        onPlatformDecisionStatusChange={props.onPlatformDecisionStatusChange}
        onPlatformDecisionAcceptBridgeChange={props.onPlatformDecisionAcceptBridgeChange}
        onPlatformDecisionOwnerNameChange={props.onPlatformDecisionOwnerNameChange}
        onPlatformDecisionOwnerRoleChange={props.onPlatformDecisionOwnerRoleChange}
        onPlatformDecisionEnvironmentChange={props.onPlatformDecisionEnvironmentChange}
        onPlatformDecisionEvidenceUrlChange={props.onPlatformDecisionEvidenceUrlChange}
        onPlatformDecisionProductionEvidenceIdsChange={props.onPlatformDecisionProductionEvidenceIdsChange}
        onPlatformDecisionProductionEvidenceVerifiedAtChange={props.onPlatformDecisionProductionEvidenceVerifiedAtChange}
        onPlatformDecisionNotesChange={props.onPlatformDecisionNotesChange}
        onSubmitPlatformDecisionReview={props.onSubmitPlatformDecisionReview}
      />
      <EnterpriseReleaseGatePanel
        disabled={disabled}
        canSubmitReview={canSubmitReview}
        enterpriseReleaseGateState={props.enterpriseReleaseGateState}
        latestReleaseGateReview={props.latestReleaseGateReview}
        latestReleaseGateIdentitySnapshot={props.latestReleaseGateIdentitySnapshot}
        platformBlockers={platformBlockers}
        releaseGateDecision={props.releaseGateDecision}
        releaseGateVersion={props.releaseGateVersion}
        releaseGateEnvironment={props.releaseGateEnvironment}
        releaseGateApproverName={props.releaseGateApproverName}
        releaseGateApproverRole={props.releaseGateApproverRole}
        releaseGateNotes={props.releaseGateNotes}
        releaseGateVerificationStatus={props.releaseGateVerificationStatus}
        releaseGateVerificationSummary={props.releaseGateVerificationSummary}
        releaseGateVerificationHash={props.releaseGateVerificationHash}
        onReleaseGateDecisionChange={props.onReleaseGateDecisionChange}
        onReleaseGateVersionChange={props.onReleaseGateVersionChange}
        onReleaseGateEnvironmentChange={props.onReleaseGateEnvironmentChange}
        onReleaseGateApproverNameChange={props.onReleaseGateApproverNameChange}
        onReleaseGateApproverRoleChange={props.onReleaseGateApproverRoleChange}
        onReleaseGateNotesChange={props.onReleaseGateNotesChange}
        onReleaseGateVerificationStatusChange={props.onReleaseGateVerificationStatusChange}
        onReleaseGateVerificationSummaryChange={props.onReleaseGateVerificationSummaryChange}
        onReleaseGateVerificationHashChange={props.onReleaseGateVerificationHashChange}
        onRefreshReleaseGateReviews={props.onRefreshReleaseGateReviews}
        onExportReleaseGateReviewsJson={props.onExportReleaseGateReviewsJson}
        onSubmitReleaseGateReview={props.onSubmitReleaseGateReview}
      />
      <EnterpriseCollaborationProjectPanel
        activeEnterpriseProjectId={props.activeEnterpriseProjectId}
        busy={props.busy}
        disabled={disabled}
        enterpriseCollaboration={props.enterpriseCollaboration}
        enterpriseCollaborationTransport={props.enterpriseCollaborationTransport}
        enterpriseClaimPackage={props.enterpriseClaimPackage}
        latestEnterpriseAnalysisRun={props.latestEnterpriseAnalysisRun}
        latestEnterpriseImportRun={props.latestEnterpriseImportRun}
        enterpriseComment={props.enterpriseComment}
        reliabilityReviewNote={props.reliabilityReviewNote}
        validationReviewNote={props.validationReviewNote}
        expertReviewerName={props.expertReviewerName}
        expertExpertiseArea={props.expertExpertiseArea}
        expertClaimScope={props.expertClaimScope}
        expertDataAdequacy={props.expertDataAdequacy}
        expertMethodFit={props.expertMethodFit}
        expertInterpretationValidity={props.expertInterpretationValidity}
        expertConcerns={props.expertConcerns}
        expertRecommendations={props.expertRecommendations}
        adjudicationItemId={props.adjudicationItemId}
        adjudicationCodeId={props.adjudicationCodeId}
        adjudicationDecision={props.adjudicationDecision}
        adjudicationNotesQuick={props.adjudicationNotesQuick}
        onEnterpriseCommentChange={props.onEnterpriseCommentChange}
        onReliabilityReviewNoteChange={props.onReliabilityReviewNoteChange}
        onValidationReviewNoteChange={props.onValidationReviewNoteChange}
        onExpertReviewerNameChange={props.onExpertReviewerNameChange}
        onExpertExpertiseAreaChange={props.onExpertExpertiseAreaChange}
        onExpertClaimScopeChange={props.onExpertClaimScopeChange}
        onExpertDataAdequacyChange={props.onExpertDataAdequacyChange}
        onExpertMethodFitChange={props.onExpertMethodFitChange}
        onExpertInterpretationValidityChange={props.onExpertInterpretationValidityChange}
        onExpertConcernsChange={props.onExpertConcernsChange}
        onExpertRecommendationsChange={props.onExpertRecommendationsChange}
        onAdjudicationItemIdChange={props.onAdjudicationItemIdChange}
        onAdjudicationCodeIdChange={props.onAdjudicationCodeIdChange}
        onAdjudicationDecisionChange={props.onAdjudicationDecisionChange}
        onAdjudicationNotesQuickChange={props.onAdjudicationNotesQuickChange}
        onTouchEnterprisePresence={props.onTouchEnterprisePresence}
        onRefreshEnterpriseCollaboration={props.onRefreshEnterpriseCollaboration}
        onRestoreEnterpriseProjectRevision={props.onRestoreEnterpriseProjectRevision}
        onAddEnterpriseComment={props.onAddEnterpriseComment}
        onReviewEnterpriseReliabilityRun={props.onReviewEnterpriseReliabilityRun}
        onReviewEnterpriseValidationRun={props.onReviewEnterpriseValidationRun}
        onExportEnterpriseExpertReviewDossierJson={props.onExportEnterpriseExpertReviewDossierJson}
        onSubmitEnterpriseExpertReview={props.onSubmitEnterpriseExpertReview}
        onUpdateEnterpriseExpertReview={props.onUpdateEnterpriseExpertReview}
        onAddEnterpriseAdjudication={props.onAddEnterpriseAdjudication}
      />
    </div>
  );
}
