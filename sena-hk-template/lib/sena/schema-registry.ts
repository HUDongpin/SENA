export const SENA_LEGACY_SCHEMA_VERSIONS = {
  codingReliabilityDashboard: "sena-coding-reliability-dashboard/v1",
  codingReliabilityGate: "sena-coding-reliability-gate/v1",
  fusionMathAudit: "sena-fusion-math-audit/v1",
  groupComparison: "sena-group-comparison/v1",
  groupComparisonSuite: "sena-group-comparison-suite/v1"
} as const;

export const SENA_SCHEMA_VERSIONS = {
  activeWindowBrief: "sena-active-window-brief/v1",
  analysisProvenanceEnvelope: "sena-analysis-provenance-envelope/v1",
  analysisRunList: "sena-analysis-run-list/v1",
  analysisRun: "sena-analysis-run/v1",
  apiDocumentation: "sena-api-documentation/v1",
  apiSurfaceMoratorium: "sena-api-surface-moratorium/v1",
  claimReadinessGate: "sena-claim-readiness-gate/v1",
  codingReliabilityDashboard: "sena-coding-reliability-dashboard/v2",
  codingReliabilityGate: "sena-coding-reliability-gate/v2",
  dataContractAuditArtifact: "sena-data-contract-audit-artifact/v1",
  dataContractAudit: "sena-data-contract-audit/v1",
  dataGovernanceMetadata: "sena-data-governance-metadata/v1",
  demoVerificationCompatibility: "sena-demo-verification-compatibility/v1",
  demoVerification: "sena-demo-verification/v1",
  demoWalkthrough: "sena-demo-walkthrough/v1",
  developmentPlan: "sena-development-plan/v1",
  enaManifest: "sena-ena-manifest/v1",
  enaReport: "sena-ena-report/v1",
  enterpriseApiRateLimit: "sena-enterprise-api-rate-limit/v1",
  enterpriseAuditDelivery: "sena-enterprise-audit-delivery/v1",
  enterpriseAuditIntegrity: "sena-enterprise-audit-integrity/v1",
  enterpriseAuditLog: "sena-enterprise-audit-log/v1",
  enterpriseAuditStoreRuntime: "sena-enterprise-audit-store-runtime/v1",
  enterpriseAuditWebhook: "sena-enterprise-audit-webhook/v1",
  enterpriseBackupDelivery: "sena-enterprise-backup-delivery/v1",
  enterpriseBackupRestore: "sena-enterprise-backup-restore/v1",
  enterpriseBackupVerification: "sena-enterprise-backup-verification/v1",
  enterpriseBackupWebhook: "sena-enterprise-backup-webhook/v1",
  enterpriseBackup: "sena-enterprise-backup/v1",
  enterpriseCdnContract: "sena-enterprise-cdn-contract/v1",
  enterpriseCdnProbe: "sena-enterprise-cdn-probe/v1",
  enterpriseCapabilityAudit: "sena-enterprise-capability-audit/v1",
  enterpriseClaimEvidencePackage: "sena-enterprise-claim-evidence-package/v1",
  enterpriseClaimSourceSnapshot: "sena-enterprise-claim-source-snapshot/v1",
  enterpriseCollaborationPubsubDelivery: "sena-enterprise-collaboration-pubsub-delivery/v1",
  enterpriseCollaborationPubsubWebhook: "sena-enterprise-collaboration-pubsub-webhook/v1",
  enterpriseConferenceLoadRehearsal: "sena-enterprise-conference-load-rehearsal/v1",
  enterpriseConferenceRehearsalPlan: "sena-enterprise-conference-rehearsal-plan/v1",
  enterpriseCsrfToken: "sena-enterprise-csrf-token/v1",
  enterpriseDatabaseSync: "sena-enterprise-database-sync/v1",
  enterpriseDatabaseSyncDelivery: "sena-enterprise-database-sync-delivery/v1",
  enterpriseDatabaseSyncWebhook: "sena-enterprise-database-sync-webhook/v1",
  enterpriseDb: "sena-enterprise-db/v1",
  enterpriseDeploymentReadiness: "sena-enterprise-deployment-readiness/v1",
  enterpriseEmailDelivery: "sena-enterprise-email-delivery/v1",
  enterpriseEmailPayload: "sena-enterprise-email-payload/v1",
  enterpriseEmailWebhook: "sena-enterprise-email-webhook/v1",
  enterpriseExpertReview: "sena-enterprise-expert-review/v1",
  enterpriseGoLiveAttestation: "sena-enterprise-go-live-attestation/v1",
  enterpriseGoLiveAttestations: "sena-enterprise-go-live-attestations/v1",
  enterpriseGoLiveChecklist: "sena-enterprise-go-live-checklist/v1",
  enterpriseGoLiveCloseoutCheck: "sena-go-live-closeout-check/v1",
  enterpriseGoLiveMonitor: "sena-enterprise-go-live-monitor/v1",
  enterpriseGoLiveRehearsal: "sena-enterprise-go-live-rehearsal/v1",
  enterpriseGoLiveRollbackDrill: "sena-enterprise-go-live-rollback-drill/v1",
  enterpriseGovernance: "sena-enterprise-governance/v1",
  enterpriseIdentityCutoverChecklist: "sena-enterprise-identity-cutover-checklist/v1",
  enterpriseIdentityEvidenceUrlHostBinding: "sena-enterprise-identity-evidence-url-host-binding/v1",
  enterpriseIdentityInstitutionActionPlan: "sena-enterprise-identity-institution-action-plan/v1",
  enterpriseIdentityOwnerRunbook: "sena-enterprise-identity-owner-runbook/v1",
  enterpriseIdentityPlatformDecisionRequestPacket: "sena-enterprise-identity-platform-decision-request-packet/v1",
  enterpriseIdentityProductionEvidenceManifest: "sena-enterprise-identity-production-evidence-manifest/v1",
  enterpriseIdentityProductionEvidence: "sena-enterprise-identity-production-evidence/v1",
  enterpriseIdentityProductionGateSummary: "sena-enterprise-identity-production-gate-summary/v1",
  enterpriseIdentityReceiptArchiveManifest: "sena-enterprise-identity-receipt-archive-manifest/v1",
  enterpriseIdentityRotationFreshness: "sena-enterprise-identity-rotation-freshness/v1",
  enterpriseIdentitySubmissionMatrix: "sena-enterprise-identity-submission-matrix/v1",
  enterpriseIdentitySubmissionVerifier: "sena-enterprise-identity-submission-verifier/v1",
  enterpriseIdentityTechnicalEvidenceBinding: "sena-enterprise-identity-technical-evidence-binding/v1",
  enterpriseImport: "sena-enterprise-import/v1",
  enterpriseMfaSetup: "sena-enterprise-mfa-setup/v1",
  enterpriseMfaStatus: "sena-enterprise-mfa-status/v1",
  enterpriseNativeAdapterCertification: "sena-enterprise-native-adapter-certification/v1",
  enterpriseNotificationDelivery: "sena-enterprise-notification-delivery/v1",
  enterpriseNotificationWebhook: "sena-enterprise-notification-webhook/v1",
  enterpriseNotification: "sena-enterprise-notification/v1",
  enterpriseNotifications: "sena-enterprise-notifications/v1",
  enterpriseObjectStorageContract: "sena-enterprise-object-storage-contract/v1",
  enterpriseObjectStorageNative: "sena-enterprise-object-storage-native/v1",
  enterpriseObjectStorageProbe: "sena-enterprise-object-storage-probe/v1",
  enterpriseObservabilityContract: "sena-enterprise-observability-contract/v1",
  enterpriseObservabilityDelivery: "sena-enterprise-observability-delivery/v1",
  enterpriseObservabilityProbe: "sena-enterprise-observability-probe/v1",
  enterpriseObservabilitySli: "sena-enterprise-observability-sli/v1",
  enterpriseObservedRequest: "sena-enterprise-observed-request/v1",
  enterpriseOpsAlertDelivery: "sena-enterprise-ops-alert-delivery/v1",
  enterpriseOpsAlertWebhook: "sena-enterprise-ops-alert-webhook/v1",
  enterpriseOpsAlerts: "sena-enterprise-ops-alerts/v1",
  enterpriseOpsStatus: "sena-enterprise-ops-status/v1",
  enterpriseOrganizationDeployment: "sena-enterprise-organization-deployment/v1",
  enterprisePasswordPolicy: "sena-enterprise-password-policy/v1",
  enterprisePasswordResetComplete: "sena-enterprise-password-reset-complete/v1",
  enterprisePasswordResetRequest: "sena-enterprise-password-reset-request/v1",
  enterprisePlatformDecisionAcceptance: "sena-enterprise-platform-decision-acceptance/v1",
  enterprisePlatformDecisionAcceptances: "sena-enterprise-platform-decision-acceptances/v1",
  enterprisePlatformDecisionProductionEvidenceReceipt: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
  enterprisePlatformDecisionRegister: "sena-enterprise-platform-decision-register/v1",
  enterprisePostCutoverObservation: "sena-enterprise-post-cutover-observation/v1",
  enterprisePostCutoverObservations: "sena-enterprise-post-cutover-observations/v1",
  enterprisePostgresProbe: "sena-enterprise-postgres-probe/v1",
  enterprisePostgresSchemaContract: "sena-enterprise-postgres-schema-contract/v1",
  enterpriseProjectCollaboration: "sena-enterprise-project-collaboration/v1",
  enterpriseProjectList: "sena-enterprise-project-list/v1",
  enterprisePrimaryStateRuntime: "sena-enterprise-primary-state-runtime/v1",
  enterpriseProductionRuntimeEnvPacket: "sena-enterprise-production-runtime-env-packet/v1",
  enterpriseProductionGoLiveGate: "sena-enterprise-production-go-live-gate/v1",
  enterpriseProductionPerformanceBudget: "sena-enterprise-production-performance-budget/v1",
  enterpriseProductionPerformancePath: "sena-enterprise-production-performance-path/v1",
  enterpriseProductionEvidenceManifest: "sena-enterprise-production-evidence-manifest/v1",
  enterpriseProductionEvidenceArchive: "sena-enterprise-production-evidence-archive/v1",
  enterprisePerformanceSourceCustody: "sena-performance-source-custody/v1",
  enterpriseProvisioningDirectory: "sena-enterprise-provisioning-directory/v1",
  enterpriseProvisioningStatus: "sena-enterprise-provisioning-status/v1",
  enterpriseProvisioning: "sena-enterprise-provisioning/v1",
  enterpriseReleaseGateDraft: "sena-enterprise-release-gate-draft/v1",
  enterpriseReleaseGateReview: "sena-enterprise-release-gate-review/v1",
  enterpriseReleaseGateReviews: "sena-enterprise-release-gate-reviews/v1",
  enterpriseReleaseVerificationEvidence: "sena-enterprise-release-verification-evidence/v1",
  enterpriseReliabilityAdjudication: "sena-enterprise-reliability-adjudication/v1",
  enterpriseSaasOperationsReadiness: "sena-enterprise-saas-operations-readiness/v1",
  enterpriseSecurityPosture: "sena-enterprise-security-posture/v1",
  enterpriseServerJobQueueContract: "sena-enterprise-server-job-queue-contract/v1",
  enterpriseServerJobQueueWebhook: "sena-enterprise-server-job-queue-webhook/v1",
  enterpriseServerJobQueueWebhookReceipt: "sena-enterprise-server-job-queue-webhook-receipt/v1",
  enterpriseServerJobQueueProbe: "sena-enterprise-server-job-queue-probe/v1",
  enterpriseServerJobQueue: "sena-enterprise-server-job-queue/v1",
  enterpriseServerJobList: "sena-enterprise-server-job-list/v1",
  enterpriseServerJobStoreRuntime: "sena-enterprise-server-job-store-runtime/v1",
  enterpriseServerJobStatusUpdate: "sena-enterprise-server-job-status-update/v1",
  enterpriseServerJobWorkerContract: "sena-enterprise-server-job-worker-contract/v1",
  enterpriseServerJobWorkerHeartbeat: "sena-enterprise-server-job-worker-heartbeat/v1",
  enterpriseServerJob: "sena-enterprise-server-job/v1",
  enterpriseSessionList: "sena-enterprise-session-list/v1",
  enterpriseSessionRevocation: "sena-enterprise-session-revocation/v1",
  enterpriseSsoFallbackPolicy: "sena-enterprise-sso-fallback-policy/v1",
  enterpriseSsoPreflight: "sena-enterprise-sso-preflight/v1",
  enterpriseUploadObjectStorageDelivery: "sena-enterprise-upload-object-storage-delivery/v1",
  enterpriseUploadObjectStorageWebhook: "sena-enterprise-upload-object-storage-webhook/v1",
  enterpriseUploadStorageVerification: "sena-enterprise-upload-storage-verification/v1",
  enterpriseVercelProductionPreflight: "sena-enterprise-vercel-production-preflight/v1",
  evidenceLedger: "sena-evidence-ledger/v1",
  expertReviewList: "sena-expert-review-list/v1",
  expertReviewResponse: "sena-expert-review-response/v1",
  formalInferenceReadiness: "sena-formal-inference-readiness/v1",
  fusionMathAuditArtifact: "sena-fusion-math-audit-artifact/v1",
  fusionMathAudit: "sena-fusion-math-audit/v2",
  goLiveCloseoutCheck: "sena-go-live-closeout-check/v1",
  groupComparisonSuite: "sena-group-comparison-suite/v2",
  groupComparison: "sena-group-comparison/v2",
  humanConceptFigureData: "sena-human-concept-figure-data/v1",
  humanConceptPublicationFigureManifest: "sena-human-concept-publication-figure-manifest/v1",
  humanReview: "sena-human-review/v1",
  importCleaningManifest: "sena-import-cleaning-manifest/v1",
  importRunList: "sena-import-run-list/v1",
  jsnaManifest: "sena-jsna-manifest/v1",
  localReliabilityImport: "sena-local-reliability-import/v1",
  localValidationRun: "sena-local-validation-run/v1",
  methodProtocol: "sena-method-protocol/v1",
  metricProvenance: "sena-metric-provenance/v1",
  modelCard: "sena-model-card/v2",
  nullModels: "sena-null-models/v1",
  personCodePairGReport: "sena-person-code-pair-g-report/v1",
  pilotPackageManifest: "sena-pilot-package-manifest/v1",
  pilotReadiness: "sena-pilot-readiness/v1",
  productionPageContract: "sena-production-page-contract/v1",
  projectAdjudication: "sena-project-adjudication/v1",
  projectCollaboration: "sena-project-collaboration/v1",
  projectComment: "sena-project-comment/v1",
  projectDelete: "sena-project-delete/v1",
  projectList: "sena-project-list/v1",
  projectPresence: "sena-project-presence/v1",
  projectRevisionRestore: "sena-project-revision-restore/v1",
  projectSnapshot: "sena-project-snapshot/v1",
  project: "sena-project/v1",
  publicationBackupOwner: "sena-publication-backup-owner/v1",
  publicationCommitReceipt: "sena-publication-commit-receipt/v1",
  publicationDerivationManifest: "sena-publication-derivation-manifest/v1",
  publicationEnterpriseProjectEvidence: "sena-publication-enterprise-project-evidence/v1",
  publicationLock: "sena-publication-lock/v1",
  publicationPackage: "sena-publication-package/v1",
  publicationPackageOwner: "sena-publication-package-owner/v1",
  publicationStateBinding: "sena-publication-state-binding/v1",
  publicationSourceSnapshot: "sena-publication-source-snapshot/v1",
  publicationStagingOwner: "sena-publication-staging-owner/v2",
  publicationVerificationCertificate: "sena-publication-verification-certificate/v1",
  reliabilityAdjudicationCoverage: "sena-reliability-adjudication-coverage/v1",
  reliabilityAdjudicationResponse: "sena-reliability-adjudication-response/v1",
  reliabilityJsonRequest: "sena-reliability-json-request/v1",
  reliabilityJsonSource: "sena-reliability-json-source/v1",
  reliabilityPreparedInput: "sena-reliability-prepared-input/v1",
  reliabilityResponse: "sena-reliability-response/v1",
  reliabilityRunList: "sena-reliability-run-list/v1",
  reliabilityRunReview: "sena-reliability-run-review/v1",
  reportCompleteness: "sena-report-completeness/v1",
  report: "sena-report/v1",
  reviewPacketAudit: "sena-review-packet-audit/v1",
  reviewPacket: "sena-review-packet/v1",
  runtimeBundle: "sena-runtime-bundle/v1",
  runtimeConsistency: "sena-runtime-consistency/v1",
  scimGroupsList: "sena-scim-groups-list/v1",
  scimIdentityProductionGate: "sena-scim-identity-production-gate/v1",
  scimProvisioningBridge: "sena-scim-provisioning-bridge/v1",
  scimServiceProviderConfig: "sena-scim-service-provider-config/v1",
  scimUsersList: "sena-scim-users-list/v1",
  snaReport: "sena-sna-report/v1",
  ssoAuthorization: "sena-sso-authorization/v1",
  ssoProviderStatus: "sena-sso-provider-status/v1",
  stableFnv1a32: "sena-stable-fnv1a32/v1",
  teamInvitationAcceptance: "sena-team-invitation-acceptance/v1",
  teamInvitation: "sena-team-invitation/v1",
  teamMembership: "sena-team-membership/v1",
  teamState: "sena-team-state/v1",
  temporalRuntimeTrace: "sena-temporal-runtime-trace/v1",
  uploadList: "sena-upload-list/v1",
  validationParityEvidence: "sena-validation-parity-evidence/v1",
  validationPreregistrationPlan: "sena-validation-preregistration-plan/v1",
  validationRunList: "sena-validation-run-list/v1",
  validationRunReview: "sena-validation-run-review/v1",
  visualGrammar: "sena-visual-grammar/v1"
} as const;

export type SenaSchemaVersionKey = keyof typeof SENA_SCHEMA_VERSIONS;
export type SenaSchemaVersion = (typeof SENA_SCHEMA_VERSIONS)[SenaSchemaVersionKey];
export type SenaLegacySchemaVersionKey = keyof typeof SENA_LEGACY_SCHEMA_VERSIONS;
export type SenaLegacySchemaVersion = (typeof SENA_LEGACY_SCHEMA_VERSIONS)[SenaLegacySchemaVersionKey];

const senaSchemaVersionSet = new Set<string>(Object.values(SENA_SCHEMA_VERSIONS));
const senaLegacySchemaVersions = SENA_LEGACY_SCHEMA_VERSIONS as Partial<Record<SenaSchemaVersionKey, SenaLegacySchemaVersion>>;

export function getSenaSchemaVersion(key: SenaSchemaVersionKey): SenaSchemaVersion {
  return SENA_SCHEMA_VERSIONS[key];
}

export function listSenaSchemaVersions(): SenaSchemaVersion[] {
  return [...senaSchemaVersionSet].sort() as SenaSchemaVersion[];
}

export function isSenaSchemaVersion(value: unknown): value is SenaSchemaVersion {
  return typeof value === "string" && senaSchemaVersionSet.has(value);
}

export function createSenaSchemaPayload<Key extends SenaSchemaVersionKey, Payload extends Record<string, unknown>>(
  key: Key,
  payload: Payload
): { schemaVersion: (typeof SENA_SCHEMA_VERSIONS)[Key] } & Payload {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS[key],
    ...payload
  };
}

export function hasSenaSchemaVersion<Key extends SenaSchemaVersionKey>(
  value: unknown,
  key: Key
): value is { schemaVersion: (typeof SENA_SCHEMA_VERSIONS)[Key] } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion === SENA_SCHEMA_VERSIONS[key]
  );
}

export function hasCompatibleSenaSchemaVersion<Key extends SenaSchemaVersionKey>(
  value: unknown,
  key: Key
): value is { schemaVersion: (typeof SENA_SCHEMA_VERSIONS)[Key] | SenaLegacySchemaVersion } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
  const legacySchemaVersion = senaLegacySchemaVersions[key];
  return schemaVersion === SENA_SCHEMA_VERSIONS[key] || (
    legacySchemaVersion !== undefined && schemaVersion === legacySchemaVersion
  );
}

export function assertSenaSchemaVersion<Key extends SenaSchemaVersionKey>(
  value: unknown,
  key: Key
): { schemaVersion: (typeof SENA_SCHEMA_VERSIONS)[Key] } {
  if (hasSenaSchemaVersion(value, key)) return value;
  throw new Error(`Expected ${SENA_SCHEMA_VERSIONS[key]} schemaVersion.`);
}
