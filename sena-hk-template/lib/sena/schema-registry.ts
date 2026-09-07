export const SENA_LEGACY_SCHEMA_VERSIONS = {
  codingReliabilityDashboard: "sena-coding-reliability-dashboard/v1",
  codingReliabilityGate: "sena-coding-reliability-gate/v1",
  fusionMathAudit: "sena-fusion-math-audit/v1",
  groupComparison: "sena-group-comparison/v1",
  groupComparisonSuite: "sena-group-comparison-suite/v1",
  enterpriseServerJob: "sena-enterprise-server-job/v1"
} as const;

const schemaDefinitions = {
  activeWindowBrief: 1,
  analysisProvenanceEnvelope: 1,
  analysisRunList: 1,
  analysisRun: 1,
  apiDocumentation: 1,
  apiSurfaceMoratorium: 1,
  claimReadinessGate: 1,
  codingReliabilityDashboard: 2,
  codingReliabilityGate: 2,
  dataContractAuditArtifact: 1,
  dataContractAudit: 1,
  dataGovernanceMetadata: 1,
  demoVerificationCompatibility: 1,
  demoVerification: 1,
  demoWalkthrough: 1,
  developmentPlan: 1,
  enaManifest: 1,
  enaReport: 1,
  enterpriseApiRateLimit: 1,
  enterpriseAuditDelivery: 1,
  enterpriseAuditIntegrity: 1,
  enterpriseAuditLog: 1,
  enterpriseAuditStoreRuntime: 1,
  enterpriseAuditWebhook: 1,
  enterpriseBackupDelivery: 1,
  enterpriseBackupRestore: 1,
  enterpriseBackupVerification: 1,
  enterpriseBackupWebhook: 1,
  enterpriseBackup: 1,
  enterpriseCdnContract: 1,
  enterpriseCdnProbe: 1,
  enterpriseCapabilityAudit: 1,
  enterpriseClaimEvidencePackage: 2,
  enterpriseClaimSourceSnapshot: 1,
  enterpriseValidationRunEvidence: 1,
  enterpriseCollaborationPubsubDelivery: 1,
  enterpriseCollaborationPubsubWebhook: 1,
  enterpriseConferenceLoadRehearsal: 1,
  enterpriseConferenceRehearsalPlan: 1,
  enterpriseCsrfToken: 1,
  enterpriseDatabaseSync: 1,
  enterpriseDatabaseSyncDelivery: 1,
  enterpriseDatabaseSyncWebhook: 1,
  enterpriseDb: 1,
  enterpriseDeploymentReadiness: 1,
  enterpriseEmailDelivery: 1,
  enterpriseEmailPayload: 1,
  enterpriseEmailWebhook: 1,
  enterpriseExpertReview: 1,
  enterpriseExpertReviewReceipt: 1,
  enterpriseGoLiveAttestation: 1,
  enterpriseGoLiveAttestations: 1,
  enterpriseGoLiveChecklist: 1,
  enterpriseGoLiveCloseoutCheck: "go-live-closeout-check/v1",
  enterpriseGoLiveMonitor: 1,
  enterpriseGoLiveRehearsal: 1,
  enterpriseGoLiveRollbackDrill: 1,
  enterpriseGovernance: 1,
  enterpriseIdentityCutoverChecklist: 1,
  enterpriseIdentityEvidenceUrlHostBinding: 1,
  enterpriseIdentityInstitutionActionPlan: 1,
  enterpriseIdentityOwnerRunbook: 1,
  enterpriseIdentityPlatformDecisionRequestPacket: 1,
  enterpriseIdentityProductionEvidenceManifest: 1,
  enterpriseIdentityProductionEvidence: 1,
  enterpriseIdentityProductionGateSummary: 1,
  enterpriseIdentityReceiptArchiveManifest: 1,
  enterpriseIdentityRotationFreshness: 1,
  enterpriseIdentitySubmissionMatrix: 1,
  enterpriseIdentitySubmissionVerifier: 1,
  enterpriseIdentityTechnicalEvidenceBinding: 1,
  enterpriseImport: 1,
  enterpriseMfaSetup: 1,
  enterpriseMfaStatus: 1,
  enterpriseNativeAdapterCertification: 1,
  enterpriseNotificationDelivery: 1,
  enterpriseNotificationWebhook: 1,
  enterpriseNotification: 1,
  enterpriseNotifications: 1,
  enterpriseObjectStorageContract: 1,
  enterpriseObjectStorageNative: 1,
  enterpriseObjectStorageProbe: 1,
  enterpriseObservabilityContract: 1,
  enterpriseObservabilityDelivery: 1,
  enterpriseObservabilityProbe: 1,
  enterpriseObservabilitySli: 1,
  enterpriseObservedRequest: 1,
  enterpriseOpsAlertDelivery: 1,
  enterpriseOpsAlertWebhook: 1,
  enterpriseOpsAlerts: 1,
  enterpriseOpsStatus: 1,
  enterpriseOrganizationDeployment: 1,
  enterprisePasswordPolicy: 1,
  enterprisePasswordResetComplete: 1,
  enterprisePasswordResetRequest: 1,
  enterprisePlatformDecisionAcceptance: 1,
  enterprisePlatformDecisionAcceptances: 1,
  enterprisePlatformDecisionProductionEvidenceReceipt: 1,
  enterprisePlatformDecisionRegister: 1,
  enterprisePostCutoverObservation: 1,
  enterprisePostCutoverObservations: 1,
  enterprisePostgresProbe: 1,
  enterprisePostgresSchemaContract: 1,
  enterpriseProjectCollaboration: 1,
  enterpriseProjectList: 1,
  enterprisePrimaryStateRuntime: 1,
  enterpriseProductionRuntimeEnvPacket: 1,
  enterpriseProductionGoLiveGate: 1,
  enterpriseProductionPerformanceBudget: 2,
  enterpriseProductionPerformancePath: 1,
  enterpriseProductionEvidenceManifest: 1,
  enterpriseProductionEvidenceArchive: 1,
  enterprisePerformanceSourceCustody: "performance-source-custody/v1",
  enterpriseProvisioningDirectory: 1,
  enterpriseProvisioningStatus: 1,
  enterpriseProvisioning: 1,
  enterpriseReleaseGateDraft: 1,
  enterpriseReleaseGateReview: 1,
  enterpriseReleaseGateReviews: 1,
  enterpriseReleaseVerificationEvidence: 1,
  enterpriseReliabilityAdjudication: 1,
  enterpriseSaasOperationsReadiness: 1,
  enterpriseSecurityPosture: 1,
  enterpriseServerJobQueueContract: 1,
  enterpriseServerJobQueueWebhook: 2,
  enterpriseServerJobQueueWebhookReceipt: 2,
  enterpriseServerJobQueueProbe: 1,
  enterpriseServerJobQueue: 1,
  enterpriseServerJobList: 1,
  enterpriseServerJobStoreRuntime: 1,
  enterpriseServerJobStatusUpdate: 1,
  enterpriseServerJobWorkerContract: 1,
  enterpriseServerJobWorkerHeartbeat: 1,
  enterpriseServerJob: 2,
  enterpriseSessionList: 1,
  enterpriseSessionRevocation: 1,
  enterpriseSsoFallbackPolicy: 1,
  enterpriseSsoPreflight: 1,
  enterpriseUploadObjectStorageDelivery: 1,
  enterpriseUploadObjectStorageWebhook: 1,
  enterpriseUploadStorageVerification: 1,
  enterpriseVercelProductionPreflight: 1,
  evidenceLedger: 1,
  expertReviewList: 1,
  expertReviewResponse: 1,
  formalInferenceReadiness: 1,
  fusionMathAuditArtifact: 1,
  fusionMathAudit: 2,
  goLiveCloseoutCheck: 1,
  groupComparisonSuite: 2,
  groupComparison: 2,
  humanConceptFigureData: 1,
  humanConceptPublicationFigureManifest: 1,
  humanReview: 1,
  importCleaningManifest: 1,
  importRunList: 1,
  jsnaManifest: 1,
  localReliabilityImport: 1,
  localValidationRun: 1,
  methodProtocol: 1,
  metricProvenance: 1,
  modelCard: 2,
  nullModels: 1,
  personCodePairGReport: 1,
  pilotPackageManifest: 1,
  pilotReadiness: 1,
  productionPageContract: 1,
  projectAdjudication: 1,
  projectCollaboration: 1,
  projectComment: 1,
  projectDelete: 1,
  projectList: 1,
  projectPresence: 1,
  projectRevisionRestore: 1,
  projectSnapshot: 1,
  project: 1,
  publicationBackupOwner: 1,
  publicationCommitReceipt: 1,
  publicationDerivationManifest: 3,
  publicationEnterpriseProjectEvidence: 2,
  publicationLock: 1,
  publicationPackage: 1,
  publicationPackageOwner: 1,
  publicationStateBinding: 2,
  publicationSourceSnapshot: 1,
  publicationStagingOwner: 2,
  publicationVerificationCertificate: 1,
  reliabilityAdjudicationCoverage: 1,
  reliabilityAdjudicationResponse: 1,
  reliabilityJsonRequest: 1,
  reliabilityJsonSource: 1,
  reliabilityPreparedInput: 1,
  reliabilityResponse: 1,
  reliabilityRunList: 1,
  reliabilityRunReview: 1,
  reportCompleteness: 1,
  report: 1,
  reviewPacketAudit: 1,
  reviewPacket: 1,
  runtimeBundle: 1,
  runtimeConsistency: 1,
  scimGroupsList: 1,
  scimIdentityProductionGate: 1,
  scimProvisioningBridge: 1,
  scimServiceProviderConfig: 1,
  scimUsersList: 1,
  snaReport: 1,
  snapshotRestoreRequest: 1,
  snapshotRestoreResult: 1,
  ssoAuthorization: 1,
  ssoProviderStatus: 1,
  stableFnv1a32: 1,
  teamInvitationAcceptance: 1,
  teamInvitation: 1,
  teamMembership: 1,
  teamState: 1,
  temporalRuntimeTrace: 1,
  uploadList: 1,
  validationParityEvidence: 1,
  validationPreregistrationPlan: 1,
  validationRunList: 1,
  validationRunReview: 1,
  visualGrammar: 1
} as const;

// Derive repetitive schema names while preserving every public literal type.
type SchemaName<Key extends string, Result extends string = ""> =
  Key extends `${infer First}${infer Rest}`
    ? SchemaName<Rest, `${Result}${First extends Lowercase<First> ? First : `-${Lowercase<First>}`}`>
    : Result;

type ExpandedSchemaVersions = {
  [Key in keyof typeof schemaDefinitions]: (typeof schemaDefinitions)[Key] extends number
    ? `sena-${SchemaName<Key>}/v${(typeof schemaDefinitions)[Key]}`
    : `sena-${(typeof schemaDefinitions)[Key]}`;
};

// Ordinary writable/enumerable/configurable properties; both historical names
// without "enterprise-" remain explicit exceptions. The client build shares
// this exact module rather than relying on its uncompressed size.
export const SENA_SCHEMA_VERSIONS = Object.fromEntries(
  Object.entries(schemaDefinitions).map(([key, version]) => [
    key,
    `sena-${typeof version === "number"
      ? `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}/v${version}`
      : version}`
  ])
) as ExpandedSchemaVersions;

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
