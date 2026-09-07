import { describe, expect, expectTypeOf, it } from "vitest";
import { brotliCompressSync, constants } from "node:zlib";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildSenaProductionPageContract } from "../production-page-contract";
import { buildSenaRuntimeBundle } from "../runtime-bundle";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaModel } from "../model";
import {
  assertSenaSchemaVersion,
  createSenaSchemaPayload,
  getSenaSchemaVersion,
  hasSenaSchemaVersion,
  hasCompatibleSenaSchemaVersion,
  isSenaSchemaVersion,
  listSenaSchemaVersions,
  SENA_LEGACY_SCHEMA_VERSIONS,
  SENA_SCHEMA_VERSIONS
} from "../schema-registry";

// Frozen before the 2026-09-07 representation-only optimization.
const FROZEN_SCHEMA_VERSIONS = {
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
  enterpriseClaimEvidencePackage: "sena-enterprise-claim-evidence-package/v2",
  enterpriseClaimSourceSnapshot: "sena-enterprise-claim-source-snapshot/v1",
  enterpriseValidationRunEvidence: "sena-enterprise-validation-run-evidence/v1",
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
  enterpriseExpertReviewReceipt: "sena-enterprise-expert-review-receipt/v1",
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
  enterpriseProductionPerformanceBudget: "sena-enterprise-production-performance-budget/v2",
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
  enterpriseServerJobQueueWebhook: "sena-enterprise-server-job-queue-webhook/v2",
  enterpriseServerJobQueueWebhookReceipt: "sena-enterprise-server-job-queue-webhook-receipt/v2",
  enterpriseServerJobQueueProbe: "sena-enterprise-server-job-queue-probe/v1",
  enterpriseServerJobQueue: "sena-enterprise-server-job-queue/v1",
  enterpriseServerJobList: "sena-enterprise-server-job-list/v1",
  enterpriseServerJobStoreRuntime: "sena-enterprise-server-job-store-runtime/v1",
  enterpriseServerJobStatusUpdate: "sena-enterprise-server-job-status-update/v1",
  enterpriseServerJobWorkerContract: "sena-enterprise-server-job-worker-contract/v1",
  enterpriseServerJobWorkerHeartbeat: "sena-enterprise-server-job-worker-heartbeat/v1",
  enterpriseServerJob: "sena-enterprise-server-job/v2",
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
  publicationDerivationManifest: "sena-publication-derivation-manifest/v3",
  publicationEnterpriseProjectEvidence: "sena-publication-enterprise-project-evidence/v2",
  publicationLock: "sena-publication-lock/v1",
  publicationPackage: "sena-publication-package/v1",
  publicationPackageOwner: "sena-publication-package-owner/v1",
  publicationStateBinding: "sena-publication-state-binding/v2",
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
  snapshotRestoreRequest: "sena-snapshot-restore-request/v1",
  snapshotRestoreResult: "sena-snapshot-restore-result/v1",
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

const productionSourceRoots = ["app", "components", "lib"];
const schemaRegistryPath = path.join(process.cwd(), "lib", "sena", "schema-registry.ts");

function collectProductionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      if (entry === "__tests__" || entry === ".next" || entry === "node_modules") return [];
      return collectProductionSourceFiles(entryPath);
    }

    if (!/\.(ts|tsx)$/.test(entryPath)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entryPath)) return [];
    if (entryPath === schemaRegistryPath) return [];
    return [entryPath];
  });
}

describe("SENA schema registry", () => {
  it("shares only the exact registry module in production client builds without changing other webpack settings", async () => {
    const { default: nextConfig } = await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href);
    expect(typeof nextConfig.webpack).toBe("function");
    const framework = { name: "framework", priority: 40 };
    const lib = { name: "lib", priority: 30 };
    const output = { filename: "static/chunks/[name]-[contenthash].js", chunkFilename: "static/chunks/[name].[contenthash].js" };
    const splitChunks = { minSize: 20000, maxInitialRequests: 25, chunks: "all", cacheGroups: { framework, lib } };
    const config = { output, optimization: { splitChunks, minimize: true }, plugins: [] };
    const returned = nextConfig.webpack(config, { dev: false, isServer: false });
    expect(returned).toBe(config);
    expect(returned.output).toBe(output);
    expect(returned.optimization.splitChunks).toBe(splitChunks);
    const { senaSchemaRegistry, ...otherGroups } = returned.optimization.splitChunks.cacheGroups;
    expect(otherGroups).toEqual({ framework, lib });
    expect(otherGroups.framework).toBe(framework);
    expect(otherGroups.lib).toBe(lib);
    expect({ ...splitChunks, cacheGroups: otherGroups }).toEqual({ minSize: 20000, maxInitialRequests: 25, chunks: "all", cacheGroups: { framework, lib } });
    expect(senaSchemaRegistry).toMatchObject({ name: "sena-schema-registry", chunks: "all", enforce: true, reuseExistingChunk: true, priority: 20 });
    expect(Object.hasOwn(senaSchemaRegistry, "filename")).toBe(false);
    expect(senaSchemaRegistry.test({ nameForCondition: () => schemaRegistryPath })).toBe(true);
    for (const candidate of [undefined, schemaRegistryPath + ".backup", schemaRegistryPath + "?other", path.join(process.cwd(), "lib", "sena", "model.ts"), path.join(process.cwd(), "lib", "other", "schema-registry.ts")]) {
      expect(senaSchemaRegistry.test({ nameForCondition: () => candidate })).toBe(false);
    }
    expect(senaSchemaRegistry.test({})).toBe(false);
  });

  it("leaves development and server compilation untouched and refuses an unsupported production split configuration", async () => {
    const { default: nextConfig } = await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href);
    expect(typeof nextConfig.webpack).toBe("function");
    for (const flags of [{ dev: true, isServer: false }, { dev: false, isServer: true }, { dev: true, isServer: true }]) {
      const config = { optimization: { splitChunks: false } };
      expect(nextConfig.webpack(config, flags)).toBe(config);
      expect(config).toEqual({ optimization: { splitChunks: false } });
    }
    const disabled = { optimization: { splitChunks: false } };
    expect(() => nextConfig.webpack(disabled, { dev: false, isServer: false })).toThrow("existing production client splitChunks");
    expect(disabled).toEqual({ optimization: { splitChunks: false } });
  });

  it("preserves all 223 ordered schema values, data properties and exact literal types", () => {
    expect(Object.keys(FROZEN_SCHEMA_VERSIONS)).toHaveLength(223);
    expect(JSON.stringify(SENA_SCHEMA_VERSIONS)).toBe(JSON.stringify(FROZEN_SCHEMA_VERSIONS));
    expect(Object.getOwnPropertyDescriptors(SENA_SCHEMA_VERSIONS)).toEqual(
      Object.getOwnPropertyDescriptors(FROZEN_SCHEMA_VERSIONS)
    );
    expect(Object.getPrototypeOf(SENA_SCHEMA_VERSIONS)).toBe(Object.prototype);
    expect(Object.isExtensible(SENA_SCHEMA_VERSIONS)).toBe(true);
    expectTypeOf<typeof SENA_SCHEMA_VERSIONS>().toEqualTypeOf<typeof FROZEN_SCHEMA_VERSIONS>();
    for (const [key, value] of Object.entries(FROZEN_SCHEMA_VERSIONS)) {
      const schemaKey = key as keyof typeof FROZEN_SCHEMA_VERSIONS;
      expect(getSenaSchemaVersion(schemaKey)).toBe(value);
      expect(hasSenaSchemaVersion({ schemaVersion: value }, schemaKey)).toBe(true);
      expect(createSenaSchemaPayload(schemaKey, { preserved: true })).toEqual({ schemaVersion: value, preserved: true });
    }
    for (const [key, value] of Object.entries(SENA_LEGACY_SCHEMA_VERSIONS)) {
      expect(hasCompatibleSenaSchemaVersion({ schemaVersion: value }, key as keyof typeof SENA_LEGACY_SCHEMA_VERSIONS)).toBe(true);
    }
  });

  it("reduces the emitted registry module relative to the frozen string-literal implementation", () => {
    // Module regression guard only: the unchanged whole-build gate remains authoritative.
    // The same TypeScript settings and Brotli quality measured 3133 bytes before this change.
    const emitted = ts.transpileModule(readFileSync(schemaRegistryPath, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true }
    }).outputText;
    const compressed = brotliCompressSync(emitted, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    expect(compressed.length).toBeLessThan(3133);
  });

  it("keeps the pre-durable-dispatch server-job receipt as an explicit read-only legacy schema", () => {
    expect(SENA_LEGACY_SCHEMA_VERSIONS.enterpriseServerJob).toBe("sena-enterprise-server-job/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJob).toBe("sena-enterprise-server-job/v2");
  });

  it("centralizes core v1 contract identifiers without changing emitted schemas", () => {
    expect(SENA_SCHEMA_VERSIONS.productionPageContract).toBe("sena-production-page-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.runtimeBundle).toBe("sena-runtime-bundle/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseDb).toBe("sena-enterprise-db/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseCdnContract).toBe("sena-enterprise-cdn-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseCdnProbe).toBe("sena-enterprise-cdn-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli).toBe("sena-enterprise-observability-sli/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe).toBe("sena-enterprise-observability-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservedRequest).toBe("sena-enterprise-observed-request/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal).toBe("sena-enterprise-go-live-rehearsal/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseGoLiveCloseoutCheck).toBe("sena-go-live-closeout-check/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePrimaryStateRuntime).toBe("sena-enterprise-primary-state-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.publicationStateBinding).toBe("sena-publication-state-binding/v2");
    expect(SENA_SCHEMA_VERSIONS.publicationDerivationManifest).toBe("sena-publication-derivation-manifest/v3");
    expect(SENA_SCHEMA_VERSIONS.snapshotRestoreRequest).toBe("sena-snapshot-restore-request/v1");
    expect(SENA_SCHEMA_VERSIONS.snapshotRestoreResult).toBe("sena-snapshot-restore-result/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseAuditStoreRuntime).toBe("sena-enterprise-audit-store-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJob).toBe("sena-enterprise-server-job/v2");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobList).toBe("sena-enterprise-server-job-list/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate).toBe("sena-enterprise-server-job-status-update/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueue).toBe("sena-enterprise-server-job-queue/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract).toBe("sena-enterprise-server-job-queue-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook).toBe("sena-enterprise-server-job-queue-webhook/v2");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhookReceipt).toBe("sena-enterprise-server-job-queue-webhook-receipt/v2");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobStoreRuntime).toBe("sena-enterprise-server-job-store-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract).toBe("sena-enterprise-server-job-worker-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat).toBe("sena-enterprise-server-job-worker-heartbeat/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract).toBe("sena-enterprise-object-storage-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageNative).toBe("sena-enterprise-object-storage-native/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe).toBe("sena-enterprise-object-storage-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract).toBe("sena-enterprise-observability-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePostgresProbe).toBe("sena-enterprise-postgres-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract).toBe("sena-enterprise-postgres-schema-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget).toBe("sena-enterprise-production-performance-budget/v2");
    expect(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody).toBe("sena-performance-source-custody/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal).toBe("sena-enterprise-conference-load-rehearsal/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseConferenceRehearsalPlan).toBe("sena-enterprise-conference-rehearsal-plan/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest).toBe("sena-enterprise-production-evidence-manifest/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive).toBe("sena-enterprise-production-evidence-archive/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight).toBe("sena-enterprise-vercel-production-preflight/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket).toBe("sena-enterprise-production-runtime-env-packet/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate).toBe("sena-enterprise-production-go-live-gate/v1");
    expect(SENA_SCHEMA_VERSIONS.humanConceptFigureData).toBe("sena-human-concept-figure-data/v1");
    expect(SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest).toBe(
      "sena-human-concept-publication-figure-manifest/v1"
    );

    expect(getSenaSchemaVersion("productionPageContract")).toBe(buildSenaProductionPageContract().schemaVersion);

    const model = buildSenaModel(lessonStudySenaContract);
    const bundle = buildSenaRuntimeBundle(model, { sourceDataset: lessonStudySenaContract });
    expect(getSenaSchemaVersion("runtimeBundle")).toBe(bundle.schemaVersion);
  });

  it("registers every persisted publication transaction contract without changing its version", () => {
    expect(SENA_SCHEMA_VERSIONS.publicationBackupOwner).toBe(
      "sena-publication-backup-owner/v1"
    );
    expect(SENA_SCHEMA_VERSIONS.publicationStagingOwner).toBe(
      "sena-publication-staging-owner/v2"
    );
    expect(SENA_SCHEMA_VERSIONS.publicationPackageOwner).toBe(
      "sena-publication-package-owner/v1"
    );
    expect(SENA_SCHEMA_VERSIONS.publicationCommitReceipt).toBe(
      "sena-publication-commit-receipt/v1"
    );
    expect(SENA_SCHEMA_VERSIONS.publicationLock).toBe("sena-publication-lock/v1");
  });

  it("keeps publication transaction schema values behind the registry module", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts", "generate-sena-human-concept-publication-figures.ts"),
      "utf8"
    );

    expect(source).not.toMatch(
      /["']sena-publication-(?:backup-owner|staging-owner|package-owner|commit-receipt|lock)\/v\d+["']/
    );
  });

  it("provides registry introspection and runtime validation helpers", () => {
    const versions = listSenaSchemaVersions();
    expect(versions).toContain("sena-review-packet/v1");
    expect(versions).toContain("sena-enterprise-platform-decision-register/v1");
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((schemaVersion) => /^sena-.+\/v\d+$/.test(schemaVersion))).toBe(true);

    expect(isSenaSchemaVersion("sena-runtime-bundle/v1")).toBe(true);
    expect(isSenaSchemaVersion("sena-runtime-bundle/v2")).toBe(false);
  });

  it("builds and checks schema-versioned payloads through the registry interface", () => {
    const payload = createSenaSchemaPayload("validationRunList", {
      validationRuns: [{ id: "val_1" }]
    });

    expect(payload).toEqual({
      schemaVersion: SENA_SCHEMA_VERSIONS.validationRunList,
      validationRuns: [{ id: "val_1" }]
    });
    expect(hasSenaSchemaVersion(payload, "validationRunList")).toBe(true);
    expect(hasSenaSchemaVersion(payload, "reviewPacket")).toBe(false);
    expect(assertSenaSchemaVersion(payload, "validationRunList")).toBe(payload);
    expect(() => assertSenaSchemaVersion(payload, "reviewPacket")).toThrow("Expected sena-review-packet/v1");
  });

  it("keeps runtime bundle emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "runtime-bundle.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps review packet emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "review-packet.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
    expect(source).not.toMatch(/schemaVersion\s+===\s+"sena-[^"]+\/v\d+"/);
  });

  it("keeps report emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "report.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps publication export emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "publication-export.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps production source schema versions behind the registry module", () => {
    const files = productionSourceRoots.flatMap((root) => collectProductionSourceFiles(path.join(process.cwd(), root)));
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return source
        .split("\n")
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => /schemaVersion.*["']sena-[^"']+\/v\d+["']/.test(line))
        .map(({ line, lineNumber }) => `${path.relative(process.cwd(), file)}:${lineNumber}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});
