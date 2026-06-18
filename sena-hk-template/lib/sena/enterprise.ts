import { createCipheriv, createDecipheriv, createHash, createHmac, createPublicKey, pbkdf2Sync, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { JsonWebKey as CryptoJsonWebKey } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SenaAnalysisRunArtifact } from "./analysis-run";
import { createEnterpriseStateStore, type SenaEnterpriseStateStore } from "./enterprise/state";
import type { SenaGroupComparisonMetric, SenaGroupComparisonResult, SenaGroupComparisonValidationResult } from "./inference";
import type { SenaEnterpriseImportCleaningManifest, SenaImportAdapterSource } from "./import-adapters";
import type { SenaReliabilityDashboard } from "./reliability";
import { senaRuntimeProvenance } from "./runtime-constants";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaCodingReliabilityReview, SenaDataset, SenaProjectSnapshot, SenaRuntimeProvenance } from "./types";
import { createEnterprisePostgresDatabaseSyncAdapterFromEnv, resolveEnterprisePostgresConfig, type SenaEnterprisePostgresConfig } from "./enterprise-postgres";

export const senaSessionCookieName = "sena_session";
export const senaCsrfHeaderName = "x-sena-csrf-token";

export type SenaEnterpriseStorageEngine = "file-backed-json" | "postgres" | "neon-postgres";
export type SenaEnterpriseWebhookProviderMode = "webhook" | "local-sink" | "not-configured";
export type SenaEnterpriseWebhookQueueProvider = "webhook" | "local-sink";

export type SenaEnterprisePostgresStorageEvidence = {
  configured: boolean;
  adapter: "postgres" | "neon";
  urlEnvName?: string;
  connectionHash?: string;
  missingEnv: string[];
  liveProbe: "not-run";
};

export type SenaEnterpriseSsoProvider = "institution" | "google" | "orcid";

export type SenaEnterpriseRole = "owner" | "pi" | "admin" | "coder" | "reviewer" | "viewer";

export type SenaEnterprisePermission =
  | "team:manage"
  | "member:invite"
  | "upload:create"
  | "upload:read"
  | "project:create"
  | "project:read"
  | "project:update"
  | "project:delete"
  | "project:comment"
  | "reliability:adjudicate"
  | "expert:review"
  | "analysis:run"
  | "export:create";

export type SenaEnterpriseProvisioningSource = "api" | "scim";

export type SenaEnterpriseProvisioningMetadata = {
  source: SenaEnterpriseProvisioningSource;
  externalId?: string;
  lastSyncedAt: string;
};

export type SenaEnterpriseUser = {
  id: string;
  email: string;
  name: string;
  organization: string;
  passwordHash?: string;
  ssoIdentities: Array<{ provider: SenaEnterpriseSsoProvider; subject: string; linkedAt: string }>;
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseTeam = {
  id: string;
  name: string;
  plan: "individual" | "lab" | "enterprise";
  organization: string;
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseMembership = {
  id: string;
  teamId: string;
  userId: string;
  role: SenaEnterpriseRole;
  status: "active" | "suspended";
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseInvitation = {
  id: string;
  teamId: string;
  email: string;
  role: SenaEnterpriseRole;
  inviteCode: string;
  status: "pending" | "accepted" | "revoked";
  invitedBy: string;
  createdAt: string;
  acceptedAt?: string;
};

export type SenaEnterpriseSessionProfile = "standard" | "remembered";

export type SenaEnterpriseSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  sessionProfile: SenaEnterpriseSessionProfile;
  ttlDays: number;
};

export type SenaEnterpriseSessionSummary = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  sessionProfile: SenaEnterpriseSessionProfile;
  ttlDays: number;
};

export type SenaEnterpriseSessionList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSessionList;
  generatedAt: string;
  currentSessionId: string;
  sessionDays: number;
  sessionPolicy: {
    standardDays: number;
    rememberedDays: number;
  };
  sessions: SenaEnterpriseSessionSummary[];
};

export type SenaEnterpriseSessionRevocation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSessionRevocation;
  generatedAt: string;
  revokedSessionIds: string[];
  revokedCount: number;
  currentSessionRevoked: boolean;
  remainingSessions: SenaEnterpriseSessionSummary[];
};

export type SenaEnterpriseCsrfToken = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCsrfToken;
  generatedAt: string;
  headerName: typeof senaCsrfHeaderName;
  token: string;
  sessionId: string;
  expiresAt: string;
  keySource: "env-configured" | "session-secret" | "local-default-review";
};

export type SenaEnterpriseSsoState = {
  id: string;
  provider: SenaEnterpriseSsoProvider;
  stateHash: string;
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
  inviteCode?: string;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterpriseAuthLockout = {
  id: string;
  emailHash: string;
  emailDomain: string;
  failedCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  lockedUntil?: string;
};

export type SenaEnterpriseApiRateLimit = {
  id: string;
  bucket: string;
  keyHash: string;
  requestCount: number;
  limit: number;
  windowSeconds: number;
  windowStartedAt: string;
  expiresAt: string;
  limitedAt?: string;
};

export type SenaEnterpriseMfaSealedSecret = {
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  tag: string;
};

export type SenaEnterpriseMfaFactor = {
  id: string;
  userId: string;
  type: "totp";
  label: string;
  secret: SenaEnterpriseMfaSealedSecret;
  createdAt: string;
  verifiedAt: string;
  lastUsedAt?: string;
  disabledAt?: string;
};

export type SenaEnterpriseMfaSetup = {
  id: string;
  userId: string;
  setupTokenHash: string;
  secret: SenaEnterpriseMfaSealedSecret;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterpriseMfaChallenge = {
  id: string;
  userId: string;
  challengeHash: string;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterprisePasswordResetRequest = {
  id: string;
  userId?: string;
  emailHash: string;
  emailDomain: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type SenaEnterpriseMfaStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: boolean;
  method: "totp" | null;
  factorId?: string;
  verifiedAt?: string;
  lastUsedAt?: string;
};

export type SenaEnterpriseMfaSetupResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaSetup;
  method: "totp";
  setupToken: string;
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
};

export type SenaEnterpriseMfaEnableResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: true;
  method: "totp";
  factorId: string;
  verifiedAt: string;
};

export type SenaEnterpriseMfaDisableResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: false;
  method: null;
  disabledAt: string;
};

export type SenaEnterpriseLoginMfaChallenge = {
  mfaRequired: true;
  method: "totp";
  challengeToken: string;
  expiresAt: string;
};

export type SenaEnterpriseLoginResult =
  | { token: string; context: SenaEnterpriseSessionContext }
  | SenaEnterpriseLoginMfaChallenge;

export type SenaEnterprisePasswordResetRequestResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordResetRequest;
  status: "queued";
  expiresAt: string;
  delivery: {
    mode: "email-provider-required" | "email-webhook" | "local-token";
    emailDeliveryId?: string;
    resetToken?: string;
    resetUrl?: string;
  };
};

export type SenaEnterprisePasswordResetCompleteResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordResetComplete;
  status: "completed";
  resetAt: string;
};

export type SenaEnterpriseNotificationKind =
  | "team.invite"
  | "auth.password_reset"
  | "project.comment"
  | "reliability.review"
  | "expert.review"
  | "validation.review";

export type SenaEnterpriseNotificationStatus = "delivered" | "read" | "failed";

export type SenaEnterpriseNotificationWebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseNotificationWebhookDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseNotificationWebhookDeliveryStatus;
  endpointHash: string;
  queuedAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
};

export type SenaEnterpriseNotification = {
  id: string;
  kind: SenaEnterpriseNotificationKind;
  status: SenaEnterpriseNotificationStatus;
  channel: "in-app";
  userId?: string;
  teamId?: string;
  projectId?: string;
  recipientEmailHash?: string;
  recipientEmailDomain?: string;
  title: string;
  body: string;
  actionUrl?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  detail: Record<string, string | number | boolean | null>;
  webhookDelivery?: SenaEnterpriseNotificationWebhookDelivery;
};

export type SenaEnterpriseNotificationQuery = {
  teamId?: string;
  status?: SenaEnterpriseNotificationStatus;
  kind?: SenaEnterpriseNotificationKind;
  limit?: number;
  offset?: number;
};

export type SenaEnterpriseNotificationResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNotifications;
  generatedAt: string;
  scope: {
    mode: "user" | "team";
    teamId?: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    nextOffset: number | null;
  };
  notifications: SenaEnterpriseNotification[];
};

export type SenaEnterpriseNotificationDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNotificationDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    limit: number;
    force: boolean;
  };
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  notifications: Array<{
    notificationId: string;
    kind: SenaEnterpriseNotificationKind;
    teamId?: string;
    projectId?: string;
    webhookStatus: SenaEnterpriseNotificationWebhookDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

export type SenaEnterpriseEmailDeliveryKind = "auth.password_reset" | "team.invite";

export type SenaEnterpriseEmailDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseEmailDeliveryPayload = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseEmailPayload;
  kind: SenaEnterpriseEmailDeliveryKind;
  recipient: {
    email: string;
    name?: string;
  };
  subject: string;
  bodyText: string;
  actionUrl?: string;
  expiresAt?: string;
  templateData: Record<string, string | number | boolean | null>;
};

export type SenaEnterpriseEmailDelivery = {
  id: string;
  kind: SenaEnterpriseEmailDeliveryKind;
  status: SenaEnterpriseEmailDeliveryStatus;
  provider: SenaEnterpriseWebhookQueueProvider;
  endpointHash: string;
  teamId?: string;
  userId?: string;
  projectId?: string;
  recipientEmailHash: string;
  recipientEmailDomain: string;
  sealedPayload: SenaEnterpriseMfaSealedSecret;
  queuedAt: string;
  expiresAt?: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
};

export type SenaEnterpriseEmailDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseEmailDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    limit: number;
    force: boolean;
  };
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  emails: Array<{
    emailDeliveryId: string;
    kind: SenaEnterpriseEmailDeliveryKind;
    teamId?: string;
    userId?: string;
    projectId?: string;
    emailStatus: SenaEnterpriseEmailDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

export type SenaEnterpriseProvisioningTeamInput = {
  externalId?: string;
  name: string;
  organization?: string;
  plan?: SenaEnterpriseTeam["plan"];
};

export type SenaEnterpriseProvisioningMembershipInput = {
  teamId?: string;
  teamExternalId?: string;
  teamName?: string;
  role: SenaEnterpriseRole;
  status?: SenaEnterpriseMembership["status"];
};

export type SenaEnterpriseProvisioningUserInput = {
  externalId?: string;
  email: string;
  name?: string;
  organization?: string;
  status?: SenaEnterpriseMembership["status"];
  sso?: {
    provider: SenaEnterpriseSsoProvider;
    subject: string;
  };
  memberships?: SenaEnterpriseProvisioningMembershipInput[];
};

export type SenaEnterpriseProvisioningInput = {
  source?: SenaEnterpriseProvisioningSource;
  organization: string;
  dryRun?: boolean;
  teams?: SenaEnterpriseProvisioningTeamInput[];
  users?: SenaEnterpriseProvisioningUserInput[];
};

export type SenaEnterpriseProvisioningResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProvisioning;
  generatedAt: string;
  dryRun: boolean;
  source: SenaEnterpriseProvisioningSource;
  organization: string;
  summary: {
    teamsCreated: number;
    teamsUpdated: number;
    usersCreated: number;
    usersUpdated: number;
    membershipsCreated: number;
    membershipsUpdated: number;
  };
  teams: Array<{
    id: string;
    externalId?: string;
    name: string;
    status: "created" | "updated";
  }>;
  users: Array<{
    id: string;
    externalId?: string;
    emailHash: string;
    emailDomain: string;
    status: "created" | "updated";
  }>;
  memberships: Array<{
    id: string;
    teamId: string;
    userId: string;
    role: SenaEnterpriseRole;
    status: SenaEnterpriseMembership["status"];
    change: "created" | "updated";
  }>;
};

export type SenaEnterpriseProvisioningDirectory = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProvisioningDirectory;
  generatedAt: string;
  source: SenaEnterpriseProvisioningSource;
  users: Array<{
    id: string;
    externalId?: string;
    email: string;
    name: string;
    organization: string;
    ssoSubjects: string[];
    memberships: Array<{
      id: string;
      teamId: string;
      teamExternalId?: string;
      teamName: string;
      role: SenaEnterpriseRole;
      status: SenaEnterpriseMembership["status"];
    }>;
  }>;
  teams: Array<{
    id: string;
    externalId?: string;
    name: string;
    organization: string;
    plan: SenaEnterpriseTeam["plan"];
    members: Array<{
      userId: string;
      userExternalId?: string;
      display: string;
      role: SenaEnterpriseRole;
      status: SenaEnterpriseMembership["status"];
    }>;
  }>;
};

export type SenaEnterpriseProject = {
  id: string;
  teamId: string;
  ownerId: string;
  currentVersion: number;
  title: string;
  description: string;
  snapshot: SenaProjectSnapshot;
  datasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  activeWindowLabel: string;
  claimUse: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseProjectRevision = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  version: number;
  summary: string;
  snapshot: SenaProjectSnapshot;
  datasetCounts: SenaEnterpriseProject["datasetCounts"];
  activeWindowLabel: string;
  claimUse: string;
  createdAt: string;
};

export type SenaEnterpriseProjectComment = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  body: string;
  target: {
    kind: "project" | "node" | "edge" | "evidence" | "report" | "reliability";
    id?: string;
    label?: string;
  };
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseProjectPresence = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  activeView: string;
  cursorLabel: string;
  updatedAt: string;
  expiresAt: string;
};

export type SenaEnterpriseCollaborationPubSubEventKind =
  | "presence"
  | "comment"
  | "comment.resolve"
  | "adjudication";

export type SenaEnterpriseCollaborationPubSubDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseCollaborationPubSubDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseCollaborationPubSubDeliveryStatus;
  endpointHash: string;
  queuedAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
};

export type SenaEnterpriseCollaborationPubSubEvent = {
  id: string;
  kind: SenaEnterpriseCollaborationPubSubEventKind;
  teamId: string;
  projectId: string;
  actorUserId: string;
  createdAt: string;
  detail: Record<string, string | number | boolean | null>;
  delivery: SenaEnterpriseCollaborationPubSubDelivery;
};

export type SenaEnterpriseCollaborationPubSubDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    requestedProjectId?: string;
    limit: number;
    force: boolean;
  };
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    pending: number;
    skipped: number;
  };
  events: Array<{
    eventId: string;
    kind: SenaEnterpriseCollaborationPubSubEventKind;
    teamId: string;
    projectId: string;
    deliveryStatus: SenaEnterpriseCollaborationPubSubDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

export type SenaEnterpriseAdjudicationRecord = {
  id: string;
  projectId: string;
  teamId: string;
  reliabilityRunId?: string;
  itemId: string;
  codeId: string;
  decision: "include" | "exclude" | "revise";
  reviewerId: string;
  notes: string;
  coderValues: Record<string, boolean>;
  createdAt: string;
};

export type SenaEnterpriseUploadScanStatus = "passed" | "review";

export type SenaEnterpriseUpload = {
  id: string;
  teamId: string;
  userId: string;
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
  sha256: string;
  importProfile?: string;
  warningCount: number;
  scanStatus: SenaEnterpriseUploadScanStatus;
  scanEngine: "sena-local-upload-scan/v1";
  scanFindings: string[];
  storagePath: string;
  createdAt: string;
};

export type SenaEnterpriseUploadStorageVerification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseUploadStorageVerification;
  generatedAt: string;
  status: "pass" | "review";
  scope: {
    mode: "all-accessible-teams" | "selected-team" | "system";
    teamIds: string[];
  };
  storage: {
    engine: "private-local-directory";
    rootHint: string;
  };
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
  missing: Array<{ uploadId: string; storagePath: string }>;
  corrupt: Array<{ uploadId: string; storagePath: string; expectedSha256: string; actualSha256: string }>;
  orphanBlobs: Array<{ teamId: string; storedName: string; storagePath: string; bytes: number }>;
};

export type SenaEnterpriseUploadObjectStorageDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageDelivery;
  generatedAt: string;
  status: "not-configured" | "completed" | "partial" | "failed";
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    requestedUploadId?: string;
    limit: number;
    includeReview: boolean;
  };
  verification: SenaEnterpriseUploadStorageVerification;
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
    pendingReview: number;
  };
  uploads: Array<{
    uploadId: string;
    teamId: string;
    originalName: string;
    size: number;
    sha256: string;
    objectKey: string;
    scanStatus: SenaEnterpriseUploadScanStatus;
    deliveryStatus: "delivered" | "failed" | "skipped";
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  }>;
};

export type SenaEnterpriseImportRun = {
  id: string;
  teamId: string;
  userId: string;
  status: "completed" | "completed-with-warnings";
  fileCount: number;
  uploadIds: string[];
  sources: Array<{
    name: string;
    profile: SenaImportAdapterSource["profile"];
    rows: number;
    warningCount: number;
  }>;
  warningCount: number;
  warningsPreview: string[];
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
  datasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  createdAt: string;
};

export type SenaEnterpriseAnalysisRun = {
  id: string;
  teamId: string;
  projectId?: string;
  persistedProjectId?: string;
  userId: string;
  sourceKind: SenaAnalysisRunArtifact["source"]["kind"];
  title: string;
  includeRuntimeBundle: boolean;
  datasetCounts: SenaAnalysisRunArtifact["source"]["datasetCounts"];
  analysisDatasetCounts: SenaAnalysisRunArtifact["source"]["analysisDatasetCounts"];
  activeTemporalWindow: SenaAnalysisRunArtifact["source"]["activeTemporalWindow"];
  summary: SenaAnalysisRunArtifact["summary"];
  artifactFingerprints: {
    reportSha256: string;
    projectSnapshotSha256: string;
    runtimeBundleSha256?: string;
  };
  createdAt: string;
};

export type SenaEnterpriseReliabilityRunStatus = "pending-review" | "pending-adjudication" | "approved" | "rejected";

export type SenaEnterpriseReliabilityAdjudicationCoverage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage;
  queuedDisagreements: number;
  resolvedDisagreements: number;
  unresolvedDisagreements: number;
  coverageRate: number;
  decisions: {
    include: number;
    exclude: number;
    revise: number;
  };
  updatedAt: string;
};

export type SenaEnterpriseReliabilityRun = {
  id: string;
  teamId: string;
  projectId?: string;
  userId: string;
  status: SenaEnterpriseReliabilityRunStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reviewer: string;
  fileCount: number;
  annotationCount: number;
  coderCount: number;
  itemCount: number;
  codeCount: number;
  meanPairwiseKappa: number;
  krippendorffAlphaNominal: number;
  disagreementCount: number;
  inputFiles: Array<{
    name: string;
    size: number;
    sha256: string;
  }>;
  dashboard: SenaReliabilityDashboard;
  adjudicationCoverage: SenaEnterpriseReliabilityAdjudicationCoverage;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
  createdAt: string;
};

export type SenaEnterpriseReliabilityAdjudicationResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReliabilityAdjudication;
  reliabilityRunId: string;
  projectId: string;
  teamId: string;
  decision: SenaEnterpriseAdjudicationRecord["decision"];
  summary: {
    queuedDisagreements: number;
    created: number;
    skippedExisting: number;
    resolvedDisagreements: number;
    unresolvedDisagreements: number;
    coverageRate: number;
  };
  reliabilityRun: SenaEnterpriseReliabilityRun;
  adjudications: SenaEnterpriseAdjudicationRecord[];
};

export type SenaEnterpriseValidationRunStatus = "pending-review" | "approved" | "rejected";

export type SenaEnterpriseValidationPreregistrationPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationPreregistrationPlan;
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

export type SenaEnterpriseValidationParityEvidenceInput = {
  walkthroughDatasetLabel?: string;
  walkthroughDatasetHash?: string;
  walkthroughSource?: "input" | "analysis-run" | "project-snapshot";
  walkthroughSourceId?: string;
  expertReviewRequired?: boolean;
  studySpecificInferenceReference?: string;
  notes?: string[];
  runtimeParityIds?: string[];
};

export type SenaEnterpriseFormalInferenceReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.formalInferenceReadiness;
  status: "model-referenced" | "model-required" | "incomplete";
  resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  studySpecificInferenceReference?: string;
  comparisonCount: number;
  minGroupSize: number;
  smallSampleComparisons: number;
  permutationIterations: number;
  bootstrapIterations: number;
  alpha?: number;
  correction?: "holm";
  checks: Array<{
    id: "preregistration-plan" | "study-specific-model" | "runtime-parity" | "real-data-walkthrough" | "multiplicity-control" | "sample-size";
    label: string;
    status: "passed" | "required" | "review";
    evidence: string[];
  }>;
  blockers: string[];
  warnings: string[];
  guardrail: string;
};

export type SenaEnterpriseValidationParityEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationParityEvidence;
  status: "ready-for-review" | "incomplete";
  validationRunHash: string;
  hashAlgorithm: "sha256";
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  runtimeParity: Array<{
    id: string;
    referenceRuntime: string;
    fixturePath: string;
    status: SenaRuntimeProvenance["parityEvidence"][number]["status"];
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
    resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
    guardrail: string;
    comparisonCount: number;
    permutationIterations: number;
    bootstrapIterations: number;
    alpha?: number;
    correction?: "holm";
    studySpecificInferenceReference?: string;
  };
  formalInference: SenaEnterpriseFormalInferenceReadiness;
  gates: Array<{
    id: "rena-parity" | "r-sna-parity" | "real-data-walkthrough" | "domain-expert-review" | "study-specific-inference";
    label: string;
    status: "passed" | "missing" | "required" | "attached";
    evidence: string[];
  }>;
  notes: string[];
};

export type SenaEnterpriseValidationRun = {
  id: string;
  teamId: string;
  projectId?: string;
  userId: string;
  status: SenaEnterpriseValidationRunStatus;
  reviewerId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  preregistrationNote: string;
  methodNote: string;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  iterations: number;
  seed: number;
  pTwoSided: number;
  comparisonCount?: number;
  minHolmAdjustedP?: number;
  significantHolmCount?: number;
  observedDifference: number;
  preregistrationPlan?: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidence;
  result: SenaGroupComparisonValidationResult;
  createdAt: string;
};

export type SenaEnterpriseExpertReviewStatus = "requested" | "approved" | "changes-requested" | "rejected";

export type SenaEnterpriseExpertReview = {
  id: string;
  teamId: string;
  projectId: string;
  userId: string;
  status: SenaEnterpriseExpertReviewStatus;
  target: {
    kind: "project" | "validation-run" | "reliability-run" | "claim";
    id?: string;
    label?: string;
  };
  reviewerName: string;
  reviewerRole: string;
  expertiseArea: string;
  claimScope: "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready";
  ratings: {
    dataAdequacy: number;
    methodFit: number;
    interpretationValidity: number;
  };
  strengths: string;
  concerns: string;
  recommendations: string;
  limitations: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseClaimEvidencePackageStatus =
  | "claim-ready-with-limits"
  | "exploratory-only"
  | "not-claim-ready";

export type SenaEnterpriseClaimEvidencePackage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage;
  generatedAt: string;
  status: SenaEnterpriseClaimEvidencePackageStatus;
  project: {
    id: string;
    teamId: string;
    title: string;
    currentVersion: number;
    claimUse: string;
    activeWindowLabel: string;
    datasetCounts: SenaEnterpriseProject["datasetCounts"];
  };
  sourceSnapshotEvidence: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimSourceSnapshot;
    projectVersion: number;
    revisionId?: string;
    revisionCreatedAt?: string;
    revisionMatchesCurrentVersion: boolean;
    snapshotSchemaVersion: SenaProjectSnapshot["schemaVersion"];
    snapshotTitle: string;
    snapshotGeneratedAt: string;
    snapshotSha256: string;
    reportSha256: string;
    dataGovernance: SenaProjectSnapshot["report"]["dataGovernance"];
    datasetCounts: SenaEnterpriseProject["datasetCounts"];
    buildOptions: SenaProjectSnapshot["reproducibility"]["buildOptions"];
    activeTemporalWindow: {
      id: string;
      label: string;
      mode: string;
      index: number;
      startTurn: number;
      endTurn: number;
    } | null;
    matrixFingerprints: Array<{
      id: string;
      label: string;
      shape: string;
      checksumAlgorithm: string;
      checksum: string;
      sha256: string;
    }>;
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
    reliability?: {
      runId: string;
      status: SenaEnterpriseReliabilityRunStatus;
      reviewer: string;
      coderCount: number;
      itemCount: number;
      codeCount: number;
      meanPairwiseKappa: number;
      krippendorffAlphaNominal: number;
      disagreementCount: number;
      adjudications: number;
      adjudicationCoverage: SenaEnterpriseReliabilityAdjudicationCoverage;
      reviewedAt?: string;
    };
    validation?: {
      runId: string;
      status: SenaEnterpriseValidationRunStatus;
      analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"] | "unplanned";
      metric: SenaGroupComparisonMetric;
      groupField: "group" | "role";
      groupA: string;
      groupB: string;
      pTwoSided: number;
      observedDifference: number;
      comparisonCount: number;
      minHolmAdjustedP?: number;
      significantHolmCount?: number;
      preregistrationPlanHash?: string;
      parityEvidence?: SenaEnterpriseValidationParityEvidence;
      suiteCorrection?: "holm";
      reviewedAt?: string;
    };
    expertReview?: {
      reviewId: string;
      status: SenaEnterpriseExpertReviewStatus;
      claimScope: SenaEnterpriseExpertReview["claimScope"];
      reviewerName: string;
      reviewerRole: string;
      expertiseArea: string;
      ratings: SenaEnterpriseExpertReview["ratings"];
      target: SenaEnterpriseExpertReview["target"];
      reviewedAt?: string;
    };
  };
  artifacts: Array<{
    id: string;
    schemaVersion: string;
    sourceId: string;
    status: string;
  }>;
  guardrails: string[];
};

export type SenaEnterpriseAuditEvent =
  | "auth.register"
  | "auth.login"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.mfa.setup"
  | "auth.mfa.enable"
  | "auth.mfa.challenge"
  | "auth.mfa.verify"
  | "auth.mfa.disable"
  | "auth.password_reset.request"
  | "auth.password_reset.complete"
  | "auth.logout"
  | "auth.session.revoke"
  | "auth.sso"
  | "auth.sso.preflight.pass"
  | "auth.sso.preflight.fail"
  | "security.csrf.fail"
  | "security.rate_limit"
  | "notification.queue"
  | "notification.read"
  | "notification.webhook.deliver"
  | "notification.webhook.fail"
  | "email.queue"
  | "email.webhook.deliver"
  | "email.webhook.fail"
  | "provisioning.sync"
  | "team.invite"
  | "team.invite.accept"
  | "team.invite.revoke"
  | "team.membership.update"
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.restore"
  | "project.delete"
  | "project.comment"
  | "project.comment.resolve"
  | "project.presence"
  | "project.adjudicate"
  | "collaboration.pubsub.deliver"
  | "collaboration.pubsub.fail"
  | "upload.create"
  | "upload.object_storage.deliver"
  | "upload.object_storage.fail"
  | "analysis.run"
  | "import.run"
  | "reliability.run"
  | "reliability.adjudicate"
  | "reliability.review"
  | "expert.review"
  | "inference.run"
  | "validation.review"
  | "export.run"
  | "governance.backup"
  | "governance.backup.verify"
  | "governance.backup.deliver"
  | "governance.backup.deliver.fail"
  | "governance.database_sync.deliver"
  | "governance.database_sync.fail"
  | "ops.alert.deliver"
  | "ops.alert.deliver.fail"
  | "ops.platform_decision.review"
  | "ops.release_gate.review"
  | "ops.post_cutover_observation.start"
  | "ops.post_cutover_observation.sample"
  | "ops.post_cutover_observation.complete"
  | "ops.go_live.attestation"
  | "governance.backup.restore"
  | "governance.audit.export";

export type SenaEnterpriseAuditWebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseAuditWebhookDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseAuditWebhookDeliveryStatus;
  endpointHash: string;
  queuedAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
};

export type SenaEnterpriseAuditLogEntry = {
  id: string;
  event: SenaEnterpriseAuditEvent;
  userId?: string;
  teamId?: string;
  projectId?: string;
  createdAt: string;
  detail: Record<string, string | number | boolean | null>;
  webhookDelivery?: SenaEnterpriseAuditWebhookDelivery;
};

export type SenaEnterpriseAuditDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  integrity: SenaEnterpriseAuditIntegrity;
  summary: {
    attempted: number;
    delivered: number;
    pending: number;
    failed: number;
    skipped: number;
  };
  auditEvents: Array<{
    auditId: string;
    event: SenaEnterpriseAuditEvent;
    teamId?: string;
    projectId?: string;
    webhookStatus: SenaEnterpriseAuditWebhookDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

export type SenaEnterpriseGovernanceCheck = {
  id: string;
  label: string;
  status: "pass" | "review";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseAuditLogQuery = {
  teamId?: string;
  userId?: string;
  projectId?: string;
  event?: SenaEnterpriseAuditEvent;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type SenaEnterpriseAuditLogResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditLog;
  generatedAt: string;
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  filters: {
    userId?: string;
    projectId?: string;
    event?: SenaEnterpriseAuditEvent;
    from?: string;
    to?: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    nextOffset: number | null;
  };
  events: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseAuditIntegrity = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditIntegrity;
  generatedAt: string;
  status: "pass" | "review";
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  retention: {
    maxEvents: number;
    retainedEvents: number;
    oldestEventAt?: string;
    newestEventAt?: string;
    retentionWindowDays?: number;
    withinConfiguredWindow: boolean;
  };
  chain: {
    algorithm: "sha256-linked-audit-entry-hash";
    eventCount: number;
    headHash: string;
    firstEventHash?: string;
    lastEventHash?: string;
  };
  checks: SenaEnterpriseGovernanceCheck[];
  sample: Array<{ id: string; event: SenaEnterpriseAuditEvent; createdAt: string; entryHash: string; chainHash: string }>;
};

export type SenaEnterpriseOpsStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsStatus;
  status: "ready" | "review" | "degraded";
  generatedAt: string;
  deployment: {
    nodeVersion: string;
    runtime: "nodejs";
    nodeEnv: string;
    uptimeSeconds: number;
    opsTokenConfigured: boolean;
    provisioningTokenConfigured: boolean;
    notificationWebhookConfigured: boolean;
    emailWebhookConfigured: boolean;
    collaborationPubSubWebhookConfigured: boolean;
    databaseSyncWebhookConfigured: boolean;
    objectStorageWebhookConfigured: boolean;
    backupWebhookConfigured: boolean;
    alertWebhookConfigured: boolean;
    auditWebhookConfigured: boolean;
  };
  storage: {
    engine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
    postgres?: SenaEnterprisePostgresStorageEvidence;
    dbFileExists: boolean;
    dbBytes: number;
    dbUpdatedAt?: string;
    dbBackupExists: boolean;
    dbBackupBytes: number;
    dbBackupUpdatedAt?: string;
    writable: boolean;
    writeProbe: "pass" | "fail";
    lockProbe: "pass" | "fail";
    lockTimeoutMs: number;
    writeErrorHash?: string;
    lockErrorHash?: string;
  };
  backup: {
    status: "fresh" | "stale" | "missing";
    lastBackupAt?: string;
    lastVerifiedAt?: string;
    backupAgeSeconds: number | null;
    warningAfterHours: number;
  };
  queues: {
    notificationsPendingWebhook: number;
    notificationsFailedWebhook: number;
    emailPendingWebhook: number;
    emailFailedWebhook: number;
    auditPendingWebhook: number;
    auditFailedWebhook: number;
    collaborationPubSubPending: number;
    collaborationPubSubFailed: number;
    activePasswordResetRequests: number;
    activeAuthLockouts: number;
    activeApiRateLimitBuckets: number;
  };
  counts: SenaEnterpriseGovernanceStatus["counts"] & {
    sessions: number;
    provisionedUsers: number;
    provisionedTeams: number;
    provisionedMemberships: number;
  };
  checks: SenaEnterpriseGovernanceCheck[];
};

export type SenaEnterpriseDeploymentReadinessItem = {
  id: string;
  label: string;
  severity: "blocking" | "advisory";
  status: "pass" | "review";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseDeploymentReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDeploymentReadiness;
  status: "ready" | "review" | "blocked";
  generatedAt: string;
  environment: {
    nodeEnv: string;
    runtime: "nodejs";
    storageEngine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
    opsTokenConfigured: boolean;
    provisioningTokenConfigured: boolean;
    notificationWebhookConfigured: boolean;
    emailWebhookConfigured: boolean;
    collaborationPubSubWebhookConfigured: boolean;
    databaseSyncWebhookConfigured: boolean;
    objectStorageWebhookConfigured: boolean;
    backupWebhookConfigured: boolean;
    alertWebhookConfigured: boolean;
    auditWebhookConfigured: boolean;
    oidcProvidersConfigured: SenaEnterpriseSsoProvider[];
  };
  summary: {
    blockingPass: number;
    blockingReview: number;
    advisoryPass: number;
    advisoryReview: number;
    blockers: string[];
  };
  blocking: SenaEnterpriseDeploymentReadinessItem[];
  advisory: SenaEnterpriseDeploymentReadinessItem[];
  runbook: {
    requiredBeforeProduction: string[];
    platformDecisions: string[];
    platformDecisionRegister: "sena-enterprise-platform-decision-register/v1";
    verificationCommands: string[];
  };
};

export type SenaEnterpriseSecurityControlCategory =
  | "identity"
  | "access"
  | "data-protection"
  | "audit-monitoring"
  | "continuity";

export type SenaEnterpriseSecurityControl = {
  id: string;
  category: SenaEnterpriseSecurityControlCategory;
  label: string;
  severity: SenaEnterpriseDeploymentReadinessItem["severity"];
  status: SenaEnterpriseDeploymentReadinessItem["status"];
  source: "governance" | "readiness";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseSecurityPosture = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSecurityPosture;
  status: "ready" | "review" | "blocked";
  generatedAt: string;
  evidenceSources: {
    governanceSchema: SenaEnterpriseGovernanceStatus["schemaVersion"];
    readinessSchema: SenaEnterpriseDeploymentReadiness["schemaVersion"];
  };
  summary: {
    controls: number;
    pass: number;
    review: number;
    blockingReview: number;
    advisoryReview: number;
    categories: Array<{
      id: SenaEnterpriseSecurityControlCategory;
      controls: number;
      review: number;
    }>;
  };
  auth: {
    sessionCookie: string;
    sessionDays: number;
    sessionPolicy: {
      standardDays: number;
      rememberedDays: number;
    };
    passwordHash: SenaEnterpriseGovernanceStatus["auth"]["passwordHash"];
    ssoModes: SenaEnterpriseSsoProvider[];
    configuredOidcProviders: SenaEnterpriseSsoProvider[];
    mfa: SenaEnterpriseGovernanceStatus["auth"]["mfa"];
    passwordReset: SenaEnterpriseGovernanceStatus["auth"]["passwordReset"];
  };
  controls: SenaEnterpriseSecurityControl[];
  runbook: {
    requiredBeforeProduction: string[];
    reviewBeforePublication: string[];
    api: "/api/sena/governance/security";
  };
};

export type SenaEnterpriseOpsAlert = {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info";
  status: "firing";
  source: "ops-status" | "deployment-readiness" | "alerting-ownership";
  evidence: string[];
  nextAction: string;
  owner: string;
  runbookUrl?: string;
  createdAt: string;
};

export type SenaEnterpriseOpsAlerts = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsAlerts;
  generatedAt: string;
  status: "clear" | "warning" | "critical";
  ownership: {
    configured: boolean;
    owner: string;
    runbookUrl?: string;
    channel: string;
  };
  summary: {
    critical: number;
    warning: number;
    info: number;
    firing: number;
  };
  alerts: SenaEnterpriseOpsAlert[];
};

export type SenaEnterpriseOpsAlertDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsAlertDelivery;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: "webhook" | "local-sink" | "postgres-native" | "not-configured";
    configured: boolean;
    endpointHash?: string;
    urlEnvName?: string;
    connectionHash?: string;
    adapter?: "postgres" | "neon";
    secretConfigured: boolean;
    timeoutMs: number;
  };
  alerts: {
    generatedAt: string;
    status: SenaEnterpriseOpsAlerts["status"];
    summary: SenaEnterpriseOpsAlerts["summary"];
    ownership: SenaEnterpriseOpsAlerts["ownership"];
  };
  delivery: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
};

export type SenaEnterpriseOrganizationDeploymentEnv = {
  name: string;
  category: "runtime" | "auth" | "identity" | "sso" | "provisioning" | "storage" | "notifications" | "collaboration" | "uploads" | "governance" | "ops";
  required: boolean;
  configured: boolean;
  secret: boolean;
  status: "pass" | "review";
  purpose: string;
  endpointHash?: string;
  valueHash?: string;
  defaultedTo?: string;
};

export type SenaEnterpriseOrganizationDeploymentDecision = {
  id: string;
  label: string;
  status: "ready" | "bridge-ready" | "open";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterprisePlatformDecisionCategory =
  | "storage"
  | "identity"
  | "collaboration"
  | "delivery"
  | "operations"
  | "saas";

export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus = "accepted" | "present" | "missing";

export type SenaEnterprisePlatformDecisionEvidenceChecklistItem = {
  id: string;
  label: string;
  status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
  productionRequired: boolean;
  source: "platform-acceptance" | "technical-readiness";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterprisePlatformDecisionRegisterDecision = SenaEnterpriseOrganizationDeploymentDecision & {
  category: SenaEnterprisePlatformDecisionCategory;
  productionBlocking: boolean;
  acceptedBridge: boolean;
  ownerEvidence: string[];
  acceptanceCriteria: string[];
  evidenceChecklist: SenaEnterprisePlatformDecisionEvidenceChecklistItem[];
};

export type SenaEnterprisePlatformDecisionRegister = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister;
  generatedAt: string;
  summary: {
    decisions: number;
    ready: number;
    bridgeReady: number;
    open: number;
    productionBlocking: number;
    acceptedBridge: number;
    acceptedBridgeMissingEvidence: number;
  };
  decisions: SenaEnterprisePlatformDecisionRegisterDecision[];
  nextActions: string[];
};

export type SenaEnterpriseNativeAdapterCertificationStatus =
  | "native-ready"
  | "accepted-bridge"
  | "bridge-ready"
  | "native-required"
  | "blocked"
  | "superseded"
  | "open";

export type SenaEnterpriseNativeAdapterCertification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification;
  generatedAt: string;
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  summary: {
    adapters: number;
    nativeReady: number;
    acceptedBridge: number;
    bridgeReady: number;
    nativeRequired: number;
    productionBlocking: number;
  };
  export: {
    api: "/api/sena/ops/native-adapters";
    filename: "sena-enterprise-native-adapter-certification.json";
  };
  adapters: Array<{
    id: string;
    decisionId: string;
    category: SenaEnterprisePlatformDecisionCategory;
    label: string;
    status: SenaEnterpriseNativeAdapterCertificationStatus;
    currentAdapter: string;
    targetAdapter: string;
    bridgeSchema: string;
    acceptedBridge: boolean;
    productionBlocking: boolean;
    certificationEvidence: string[];
    ownerEvidence: string[];
    acceptanceCriteria: string[];
    nextAction: string;
  }>;
  nextActions: string[];
};

export type SenaEnterpriseSaasOperationsReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  export: {
    api: "/api/sena/ops/saas-operations";
    filename: "sena-enterprise-saas-operations-readiness.json";
  };
  approval: {
    envConfigured: boolean;
    fullSaasDecisionAccepted: boolean;
    latestReleaseGateStatus?: SenaEnterpriseReleaseGateDecision;
    latestReleaseGateVerificationStatus?: SenaEnterpriseReleaseVerificationEvidence["status"];
  };
  summary: {
    platformDecisions: number;
    acceptedPlatformDecisions: number;
    acceptedBridge: number;
    nativeAdapterProductionBlocking: number;
    releaseGateReviews: number;
    identityProductionStatus: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"] | "missing";
    identitySubmissionVerifierIncomplete: number | "missing";
    identityRotationFreshness: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"] | "missing";
    identityCutoverChecklist: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["cutoverChecklist"]["status"] | "missing";
    identityCutoverBlockers: number | "missing";
    blockers: string[];
  };
  requiredEvidence: string[];
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseCapabilityAuditStatus = "ready" | "review" | "blocked";

export type SenaEnterpriseCapabilityAuditItem = {
  id: string;
  objectiveArea: string;
  label: string;
  status: SenaEnterpriseCapabilityAuditStatus;
  evidence: string[];
  endpoints: string[];
  requiredArtifacts: string[];
  productionContractTestIds: string[];
  remainingPlatformDecisions: string[];
  nextAction: string;
};

export type SenaEnterpriseCapabilityAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCapabilityAudit;
  generatedAt: string;
  status: SenaEnterpriseCapabilityAuditStatus;
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  sourceObjective: {
    requestedCapabilityAreas: string[];
    interpretation: string;
  };
  export: {
    api: "/api/sena/ops/capability-audit";
    filename: "sena-enterprise-capability-audit.json";
  };
  summary: {
    capabilities: number;
    ready: number;
    review: number;
    blocked: number;
    platformDecisionItems: number;
  };
  capabilities: SenaEnterpriseCapabilityAuditItem[];
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseReleaseGateDraft = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft;
  generatedAt: string;
  decision: SenaEnterpriseReleaseGateDecision;
  environment: string;
  releaseVersion: string;
  verificationCommand: string;
  verificationEvidence: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence;
    command: string;
    status: SenaEnterpriseReleaseVerificationEvidence["status"];
    summary: string;
  };
  notes: string;
  requiredBeforeSubmit: string[];
  evidence: string[];
};

export type SenaEnterpriseGoLiveRollbackDrill = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRollbackDrill;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  summary: {
    goLiveStatus: "ready" | "review" | "blocked";
    backupReady: boolean;
    restoreRehearsed: boolean;
    alertingReady: boolean;
    releaseGateReady: boolean;
    blockers: string[];
  };
  requiredEvidence: string[];
  runbook: {
    ownerEvidence: string[];
    steps: Array<{
      id: string;
      label: string;
      owner: string;
      command?: string;
      evidence: string[];
    }>;
  };
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseGoLiveMonitor = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveMonitor;
  generatedAt: string;
  status: "ready" | "watch" | "blocked";
  observationWindow: {
    recommendedMinutes: number;
    exitCriteria: string[];
  };
  summary: {
    goLiveStatus: "ready" | "review" | "blocked";
    opsStatus: SenaEnterpriseOpsStatus["status"];
    alertsStatus: SenaEnterpriseOpsAlerts["status"];
    criticalAlerts: number;
    warningAlerts: number;
    releaseGateReady: boolean;
    rollbackReady: boolean;
    postCutoverObservationReady: boolean;
    blockers: string[];
  };
  requiredEvidence: string[];
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "watch" | "blocked";
    evidence: string[];
    nextAction: string;
  }>;
  latestObservation: SenaEnterprisePostCutoverObservationList;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterprisePostCutoverObservationSample = {
  recordedAt: string;
  opsStatus: SenaEnterpriseOpsStatus["status"];
  alertsStatus: SenaEnterpriseOpsAlerts["status"];
  criticalAlerts: number;
  warningAlerts: number;
  warningAlertIds: string[];
  releaseGateReady: boolean;
  rollbackReady: boolean;
  evidence: string[];
};

export type SenaEnterprisePostCutoverObservation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservation;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  status: "active" | "ready" | "blocked";
  startedAt: string;
  requiredUntil: string;
  completedAt?: string;
  startedByUserId: string;
  completedByUserId?: string;
  samples: SenaEnterprisePostCutoverObservationSample[];
  acknowledgedWarningAlertIds: string[];
  evidence: string[];
};

export type SenaEnterprisePostCutoverObservationList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservations;
  generatedAt: string;
  scope: {
    mode: "selected-team" | "managed-teams";
    teamId?: string;
  };
  summary: {
    total: number;
    active: number;
    ready: number;
    blocked: number;
    latestStatus: SenaEnterprisePostCutoverObservation["status"] | "missing";
    latestObservationId?: string;
  };
  observations: SenaEnterprisePostCutoverObservation[];
};

export type SenaEnterprisePostCutoverObservationInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
};

export type SenaEnterprisePostCutoverObservationSampleInput = {
  teamId: string;
  observationId: string;
};

export type SenaEnterprisePostCutoverObservationCompletionInput = {
  teamId: string;
  observationId: string;
  acknowledgedWarningAlertIds?: string[];
};

export type SenaEnterpriseGoLiveChecklist = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveChecklist;
  rehearsalReviewed: boolean;
  releaseGateDraftReviewed: boolean;
  verificationEvidenceReviewed: boolean;
  rollbackOwnerConfirmed: boolean;
  platformOwnerDecisionReviewed: boolean;
  passed: boolean;
  missing: string[];
};

export type SenaEnterpriseGoLiveAttestationDecision = "approved" | "conditional" | "blocked";

export type SenaEnterpriseGoLiveAttestation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseGoLiveAttestationDecision;
  status: SenaEnterpriseGoLiveAttestationDecision;
  attesterName: string;
  attesterRole: string;
  notes: string;
  checklist: SenaEnterpriseGoLiveChecklist;
  goLiveRehearsalSnapshot: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal;
    generatedAt: string;
    status: SenaEnterpriseGoLiveRehearsal["status"];
    blockers: string[];
  };
  releaseGateDraftSnapshot: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft;
    decision: SenaEnterpriseReleaseGateDecision;
    verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"];
  };
  identityProductionHandoffSnapshot: SenaEnterpriseIdentityProductionEvidence;
  latestReleaseGateSnapshot?: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview;
    id: string;
    decision: SenaEnterpriseReleaseGateDecision;
    verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"];
    identityProductionStatus?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"];
    identityProductionEvidenceDigest?: string;
    identityReceiptArchiveManifestDigest?: string;
    identityReceiptArchiveReadyForArchive?: number;
    identityReceiptArchiveReview?: number;
    identityReceiptArchiveMissingReceipts?: number;
    identityReceiptArchiveMissingInputs?: string;
    identityReceiptArchiveArtifactCompleteness?: string;
    identityReceiptArchiveDecisions?: Array<Pick<
      SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["receiptArchiveManifest"]["decisions"][number],
      "decisionId" |
      "archiveStatus" |
      "receiptVerifierStatus" |
      "digestHeader" |
      "receiptAuditDigest" |
      "receiptAuditDigestScope" |
      "stableSubmissionDigestHeader" |
      "submittedEvidenceDigest" |
      "submittedEvidenceDigestScope" |
      "productionEvidenceArtifactDigestAlgorithm" |
      "productionEvidenceArtifactDigestScope" |
      "productionEvidenceArtifactDigest" |
      "productionEvidenceArtifactDigestCoveredEvidenceIds" |
      "productionEvidenceArtifactDigestCoverageStatus" |
      "productionEvidenceArtifactDigestCompletenessStatus" |
      "missingArchiveInputs"
    >>;
    identityReleaseGateBlocked?: boolean;
    identitySubmissionVerifierIncomplete?: number;
    identitySubmissionVerifierMissing?: number;
    identitySubmissionVerifierMissingTechnical?: number;
    identityRotationFreshness?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"];
    identityEvidenceUrlHostBinding?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["status"];
    identityEvidenceAllowedHostConfig?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["allowedHostConfigStatus"];
    identityEvidenceAllowedHosts?: number;
    identityEvidenceInvalidAllowedHosts?: number;
    identityCutoverChecklistStatus?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["cutoverChecklist"]["status"];
    identityCutoverChecklistBlockingItems?: number;
  };
  evidence: string[];
  createdByUserId: string;
  createdAt: string;
};

export type SenaEnterpriseGoLiveAttestationInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseGoLiveAttestationDecision;
  attesterName: string;
  attesterRole: string;
  notes: string;
  checklist: Pick<SenaEnterpriseGoLiveChecklist,
    "rehearsalReviewed" |
    "releaseGateDraftReviewed" |
    "verificationEvidenceReviewed" |
    "rollbackOwnerConfirmed" |
    "platformOwnerDecisionReviewed"
  >;
};

export type SenaEnterpriseGoLiveAttestationList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestations;
  generatedAt: string;
  scope: {
    mode: "selected-team" | "managed-teams";
    teamId?: string;
  };
  summary: {
    total: number;
    approved: number;
    conditional: number;
    blocked: number;
  };
  attestations: SenaEnterpriseGoLiveAttestation[];
};

export type SenaEnterpriseGoLiveRehearsal = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  export: {
    api: "/api/sena/ops/go-live-rehearsal";
    filename: "sena-enterprise-go-live-rehearsal.json";
  };
  rehearsal: {
    deploymentPackage: "sena-enterprise-organization-deployment/v1";
    deploymentReadiness: "sena-enterprise-deployment-readiness/v1";
    governance: "sena-enterprise-governance/v1";
    platformDecisionRegister: "sena-enterprise-platform-decision-register/v1";
    nativeAdapterCertification: "sena-enterprise-native-adapter-certification/v1";
    saasOperationsReadiness: "sena-enterprise-saas-operations-readiness/v1";
    releaseGate: "sena-enterprise-release-gate-reviews/v1";
  };
  summary: {
    blockingItems: number;
    advisoryItems: number;
    governanceReviewItems: number;
    openPlatformDecisions: number;
    acceptedPlatformDecisions: number;
    nativeAdapterProductionBlocking: number;
    saasOperationsStatus: SenaEnterpriseSaasOperationsReadiness["status"];
    releaseGateReviews: number;
    latestReleaseGateStatus?: SenaEnterpriseReleaseGateDecision;
    latestReleaseGateVerificationStatus?: SenaEnterpriseReleaseVerificationEvidence["status"];
    blockers: string[];
  };
  requiredEvidence: string[];
  verificationCommands: string[];
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  releaseGateDraft: SenaEnterpriseReleaseGateDraft;
  rollbackDrill: SenaEnterpriseGoLiveRollbackDrill;
  postCutoverMonitor: SenaEnterpriseGoLiveMonitor;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterprisePlatformDecisionAcceptanceStatus =
  | "accepted"
  | "rejected"
  | "needs-native-adapter"
  | "superseded";

export type SenaEnterpriseIdentityTechnicalEvidenceBinding = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding;
  decisionId: string;
  provider?: SenaEnterpriseSsoProvider;
  status: "ready" | "review";
  secretBinding?: {
    clientSecretStrength: "configured" | "weak" | "missing";
    clientSecretMinLength: 32;
    clientSecretVersionConfigured?: boolean;
    clientSecretVersionHash?: string;
    clientSecretVersionEnv?: string;
  };
  secretVersionBinding?: {
    env: string;
    configured: boolean;
    versionHash?: string;
  };
  secretStoreReferenceBinding?: {
    env: "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF" | "SENA_PROVISIONING_TOKEN_SECRET_REF";
    configured: boolean;
    requiredInProduction: boolean;
    referenceHash?: string;
  };
  secretRotationCadenceBinding?: {
    env: "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS";
    configured: boolean;
    valid: boolean;
    requiredInProduction: boolean;
    minDays: 1;
    maxDays: 180;
    cadenceDays?: number;
    cadenceHash?: string;
  };
  idpTenantBinding?: {
    env: "SENA_SSO_INSTITUTION_TENANT_ID";
    configured: boolean;
    requiredInProduction: boolean;
    tenantHash?: string;
  };
  lifecycleOwnerModeBinding?: {
    env: "SENA_IDENTITY_LIFECYCLE_OWNER_MODE";
    configured: boolean;
    valid: boolean;
    requiredInProduction: boolean;
    mode?: "scim" | "idp" | "hybrid";
    modeHash?: string;
    acceptedModes: Array<"scim" | "idp" | "hybrid">;
  };
  latestPreflightAt?: string;
  latestPreflightStatus?: string;
  configBinding?: string;
  configHashes?: Partial<Record<
    | "clientIdHash"
    | "scopesHash"
    | "endpointDiscoveryHash"
    | "issuerHash"
    | "endpointAuthorizationHash"
    | "endpointTokenHash"
    | "endpointUserinfoHash"
    | "endpointJwksHash"
    | "callbackHash",
    string
  >>;
  evidence: string[];
};

export type SenaEnterprisePlatformDecisionProductionEvidenceReceipt = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionProductionEvidenceReceipt;
  decisionId: string;
  ownerNameHash?: string;
  productionEvidenceVerifiedAtHash?: string;
  allowedEvidenceIds: string[];
  submittedEvidenceIds: string[];
  acceptedEvidenceIds: string[];
  missingEvidenceIds: string[];
  receiptAuditDigestAlgorithm?: "sha256";
  receiptAuditDigestScope?: "current-validation-snapshot";
  receiptAuditDigest?: string;
  submittedEvidenceDigestAlgorithm?: "sha256";
  submittedEvidenceDigestScope?: "platform-submission-inputs";
  submittedEvidenceDigest?: string;
  productionEvidenceArtifactDigestAlgorithm?: "sha256";
  productionEvidenceArtifactDigestScope?: "external-evidence-artifact";
  productionEvidenceArtifactDigest?: string;
  productionEvidenceArtifactDigestCoveredEvidenceIds?: string[];
  productionEvidenceArtifactDigestCoverageStatus?: "covered" | "missing";
  productionEvidenceArtifactDigestCompletenessStatus?: "complete" | "partial" | "missing";
  requestPacketSchemaVersion?: "sena-enterprise-identity-platform-decision-request-packet/v1";
  responseAuditHeaders?: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
  receiptArchiveBodyPaths?: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
  requestPacketPolicyHash?: string;
  submittedRequestPacketPolicyHash?: string;
  requestPacketPolicyBindingStatus?: "current" | "stale" | "not-required";
  requestPacketPolicyEvidence?: string[];
  verifierStatus?: "ready" | "review";
  expectedEvidenceIds?: string[];
  matchedRequestEvidenceIds?: string[];
  unexpectedEvidenceIds?: string[];
  stillMissingEvidenceIds?: string[];
  technicalBindingStatus?: "current" | "stale" | "not-required";
  technicalReadinessStatus?: "ready" | "review" | "not-required";
  technicalBindingEvidence?: string[];
  rotationFreshnessStatus?: SenaEnterpriseIdentityRotationFreshness["status"];
  rotationFreshnessChecks?: SenaEnterpriseIdentityRotationFreshness["checks"];
  rotationExpiredEvidenceIds?: string[];
  rotationDueSoonEvidenceIds?: string[];
  evidenceUrlHash?: string;
  evidenceUrlPathHash?: string;
  evidenceUrlHostHash?: string;
  evidenceUrlAllowedHostHash?: string;
  evidenceUrlHostBindingStatus?: "current" | "stale" | "not-required";
  evidenceUrlHostBindingEvidence?: string[];
};

export type SenaEnterpriseIdentityRotationFreshness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness;
  generatedAt: string;
  status: "ready" | "review";
  policy: {
    maxAgeDays: number;
    warningDays: number;
  };
  summary: {
    checks: number;
    ready: number;
    dueSoon: number;
    expired: number;
    missing: number;
  };
  checks: Array<{
    id: "sso-secret-rotation" | "bearer-token-rotation";
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: "ready" | "due-soon" | "expired" | "missing";
    maxAgeDays: number;
    warningDays: number;
    ageDays: number;
    daysUntilExpiry: number;
    verifiedAtHash?: string;
    expiresAtHash?: string;
    evidenceUrlHash?: string;
    nextAction: string;
  }>;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterprisePlatformDecisionAcceptance = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptance;
  id: string;
  teamId: string;
  decisionId: string;
  status: SenaEnterprisePlatformDecisionAcceptanceStatus;
  acceptedBridge: boolean;
  ownerName: string;
  ownerRole: string;
  environment: string;
  evidenceUrl?: string;
  evidenceUrlHash?: string;
  evidenceUrlPathHash?: string;
  evidenceUrlHostHash?: string;
  evidenceUrlAllowedHostHash?: string;
  productionEvidenceIds?: string[];
  productionEvidenceArtifactDigest?: string;
  productionEvidenceVerifiedAt?: string;
  submittedRequestPacketPolicyHash?: string;
  technicalEvidenceBinding?: SenaEnterpriseIdentityTechnicalEvidenceBinding;
  productionEvidenceReceipt?: SenaEnterprisePlatformDecisionProductionEvidenceReceipt;
  notes: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterprisePlatformDecisionAcceptanceList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptances;
  generatedAt: string;
  scope: {
    mode: "managed-teams" | "selected-team";
    teamId?: string;
  };
  summary: {
    total: number;
    accepted: number;
    rejected: number;
    needsNativeAdapter: number;
    superseded: number;
    acceptedBridge: number;
    acceptedBridgeMissingEvidence: number;
  };
  acceptances: SenaEnterprisePlatformDecisionAcceptance[];
};

export type SenaEnterprisePlatformDecisionAcceptanceInput = {
  teamId: string;
  decisionId: string;
  status: SenaEnterprisePlatformDecisionAcceptanceStatus;
  acceptedBridge?: boolean;
  ownerName: string;
  ownerRole: string;
  environment: string;
  evidenceUrl?: string;
  productionEvidenceIds?: string[];
  productionEvidenceArtifactDigest?: string;
  productionEvidenceVerifiedAt?: string;
  requestPacketPolicyHash?: string;
  requireRequestPacketPolicyHash?: boolean;
  notes: string;
};

export type SenaEnterpriseReleaseGateDecision = "approved" | "blocked" | "conditional";
export type SenaEnterpriseReleaseVerificationStatus = "passed" | "failed" | "not-run";

export type SenaEnterpriseReleaseVerificationEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence;
  command: string;
  status: SenaEnterpriseReleaseVerificationStatus;
  summary: string;
  outputSha256: string;
  hashAlgorithm: "sha256";
  recordedAt: string;
};

export type SenaEnterpriseReleaseGateReview = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseReleaseGateDecision;
  status: SenaEnterpriseReleaseGateDecision;
  approverName: string;
  approverRole: string;
  notes: string;
  verificationCommand: string;
  verificationEvidence: SenaEnterpriseReleaseVerificationEvidence;
  readinessSnapshot: {
    schemaVersion: SenaEnterpriseDeploymentReadiness["schemaVersion"];
    generatedAt: string;
    status: SenaEnterpriseDeploymentReadiness["status"];
    blockingReview: number;
    advisoryReview: number;
    blockers: string[];
  };
  platformDecisionSnapshot: {
    schemaVersion: SenaEnterprisePlatformDecisionRegister["schemaVersion"];
    generatedAt: string;
    productionBlocking: number;
    open: number;
    acceptedBridge: number;
    productionBlockingDecisionIds: string[];
    missingProductionEvidence: Array<{
      decisionId: string;
      evidenceId: string;
      label: string;
      status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
      source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
      nextAction: string;
    }>;
  };
  identityProductionSnapshot: {
    schemaVersion: SenaEnterpriseIdentityProductionEvidence["schemaVersion"];
    generatedAt: string;
    status: SenaEnterpriseIdentityProductionEvidence["status"];
    dossierDigestAlgorithm?: "sha256";
    dossierDigestScope?: "identity-production-evidence-dossier";
    dossierDigest?: string;
    evidenceBindingDigestAlgorithm?: "sha256";
    evidenceBindingDigestScope?: "identity-production-evidence-binding";
    evidenceBindingDigest?: string;
    capabilityStatus: SenaEnterpriseIdentityProductionEvidence["capability"]["status"];
    missingEvidenceIds: string[];
    submissionVerifier: {
      schemaVersion: SenaEnterpriseIdentitySubmissionVerifier["schemaVersion"];
      verifiedDecisions: number;
      incompleteDecisions: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
    };
    rotationFreshness: {
      schemaVersion: SenaEnterpriseIdentityRotationFreshness["schemaVersion"];
      status: SenaEnterpriseIdentityRotationFreshness["status"];
      expiredEvidenceIds: string[];
      dueSoonEvidenceIds: string[];
    };
    platformRequestPacket: {
      schemaVersion: SenaEnterpriseIdentityPlatformDecisionRequestPacket["schemaVersion"];
      blockingRequests: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
      receiptReviewRequests: number;
      evidence: string[];
    };
    evidenceUrlHostBinding: SenaEnterpriseIdentityEvidenceUrlHostBinding;
    cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
    receiptArchiveManifest: {
      schemaVersion: SenaEnterpriseIdentityReceiptArchiveManifest["schemaVersion"];
      archiveManifestDigestAlgorithm?: "sha256";
      archiveManifestDigestScope?: "identity-receipt-archive-manifest";
      archiveManifestDigest?: string;
      summary: SenaEnterpriseIdentityReceiptArchiveManifest["summary"];
      decisions: Array<Pick<
        SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number],
        "decisionId" |
        "archiveStatus" |
        "receiptVerifierStatus" |
        "digestHeader" |
        "receiptAuditDigest" |
        "receiptAuditDigestScope" |
        "stableSubmissionDigestHeader" |
        "submittedEvidenceDigest" |
        "submittedEvidenceDigestScope" |
        "productionEvidenceArtifactDigestAlgorithm" |
        "productionEvidenceArtifactDigestScope" |
        "productionEvidenceArtifactDigest" |
        "productionEvidenceArtifactDigestCoveredEvidenceIds" |
        "productionEvidenceArtifactDigestCoverageStatus" |
        "productionEvidenceArtifactDigestCompletenessStatus" |
        "missingArchiveInputs" |
        "requestPacketPolicyBindingStatus" |
        "technicalBindingStatus" |
        "technicalReadinessStatus" |
        "evidenceUrlHostBindingStatus" |
        "rotationFreshnessStatus"
      >>;
    };
    institutionActionPlan: SenaEnterpriseIdentityInstitutionActionPlan;
    releaseGateBlocked: boolean;
  };
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseIdentityEvidenceUrlHostBinding = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding;
  status: "ready" | "review";
  allowedHostConfigStatus: "configured" | "not-configured" | "invalid";
  allowedHostCount: number;
  invalidAllowedHostCount: number;
  current: number;
  stale: number;
  missing: number;
  currentDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  staleDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  missingDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  evidence: string[];
};

export type SenaEnterpriseReleaseGateReviewInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseReleaseGateDecision;
  approverName: string;
  approverRole: string;
  notes: string;
  verificationCommand: string;
  verificationEvidence?: {
    status?: SenaEnterpriseReleaseVerificationStatus;
    summary?: string;
    outputSha256?: string;
  };
};

export type SenaEnterpriseReleaseGateReviewList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews;
  generatedAt: string;
  scope: {
    mode: "managed-teams" | "selected-team";
    teamId?: string;
  };
  summary: {
    total: number;
    approved: number;
    conditional: number;
    blocked: number;
    latestStatus?: SenaEnterpriseReleaseGateDecision;
  };
  reviews: SenaEnterpriseReleaseGateReview[];
};

export type SenaEnterpriseIdentityProductionDecisionId = "institution-idp-approval" | "institution-provisioning-owner";

export type SenaEnterpriseIdentityReceiptArchiveMissingInput =
  "productionEvidenceReceipt" |
  "receiptAuditDigest" |
  "submittedEvidenceDigest" |
  "productionEvidenceArtifactDigest" |
  "requestPacketPolicyBinding" |
  "productionEvidenceCompleteness" |
  "technicalEvidenceBinding" |
  "technicalReadiness" |
  "evidenceUrlHostBinding" |
  "rotationFreshness";

export type SenaEnterpriseIdentityPlatformDecisionRequestPacket = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket;
  generatedAt: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    evidenceUrlsHashed: true;
  };
  summary: {
    requests: number;
    blockingRequests: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
    readyRequests: number;
    receiptReviewRequests: number;
  };
  submission: {
    method: "POST";
    path: "/api/sena/ops/platform-decisions";
    responseSchema: "sena-enterprise-platform-decision-production-evidence-receipt/v1";
    responseAuditHeaders: Array<
      "x-sena-identity-request-packet-policy-hash" |
      "x-sena-identity-request-packet-policy-binding" |
      "x-sena-identity-production-receipt-digest" |
      "x-sena-identity-submitted-evidence-digest" |
      "x-sena-identity-production-evidence-artifact-digest" |
      "x-sena-identity-production-evidence-artifact-covered-ids" |
      "x-sena-identity-production-evidence-artifact-coverage" |
      "x-sena-identity-production-evidence-artifact-completeness" |
      "x-sena-identity-submitted-decision-production-evidence-artifact-completeness" |
      "x-sena-identity-production-verifier-status" |
      "x-sena-identity-evidence-url-host-binding" |
      "x-sena-identity-technical-binding" |
      "x-sena-identity-technical-readiness" |
      "x-sena-identity-rotation-freshness" |
      "x-sena-identity-rotation-expired-evidence" |
      "x-sena-identity-rotation-due-soon-evidence" |
      "x-sena-identity-receipt-archive-status" |
      "x-sena-identity-submitted-decision-receipt-archive-missing-inputs" |
      "x-sena-identity-receipt-archive-missing-inputs" |
      "x-sena-identity-production-evidence-digest" |
      "x-sena-identity-evidence-binding-digest" |
      "x-sena-identity-receipt-archive-manifest-digest" |
      "x-sena-identity-production-status" |
      "x-sena-identity-release-gate-blocked" |
      "x-sena-identity-request-blockers" |
      "x-sena-identity-receipt-review-requests" |
      "x-sena-identity-production-blocking-decisions" |
      "x-sena-identity-missing-evidence-ids" |
      "x-sena-identity-cutover-checklist" |
      "x-sena-identity-cutover-blockers" |
      "x-sena-identity-production-evidence-artifact-completeness-summary"
    >;
    receiptArchivePolicy: {
      required: true;
      digestAlgorithm: "sha256";
      digestHeader: "x-sena-identity-production-receipt-digest";
      digestScope: "current-validation-snapshot";
      stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest";
      stableSubmissionDigestScope: "platform-submission-inputs";
      stableSubmissionDigestInputFields: string[];
      archiveHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
      archiveBodyPaths: Array<
        "acceptance.productionEvidenceReceipt" |
        "identityProductionEvidence.submissionVerifier" |
        "identityProductionEvidence.cutoverChecklist" |
        "identityProductionEvidence.platformRequestPacket" |
        "identityProductionEvidence.receiptArchiveManifest" |
        "identityProductionEvidence.institutionActionPlan"
      >;
      redaction: {
        secretValuesExcluded: true;
        evidenceUrlValuesExcluded: true;
        evidenceUrlsHashed: true;
        ownerNamesHashed: true;
        productionEvidenceTimestampsHashed: true;
      };
    };
    requiredAcceptedStatus: "accepted";
    requiredAcceptedBridge: true;
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
      "productionEvidenceArtifactDigest" |
      "productionEvidenceVerifiedAt" |
      "requestPacketPolicyHash" |
      "notes"
    >;
    identityProductionEvidenceBodyFields: Array<
      "evidenceUrl" |
      "productionEvidenceIds" |
      "productionEvidenceArtifactDigest" |
      "productionEvidenceVerifiedAt" |
      "requestPacketPolicyHash"
    >;
    productionEvidenceArtifactDigestPolicy: {
      required: true;
      algorithm: "sha256";
      scope: "external-evidence-artifact";
      digestBodyField: "productionEvidenceArtifactDigest";
      responseHeader: "x-sena-identity-production-evidence-artifact-digest";
      requiredForEvidenceIds: string[];
      artifactCustody: "institution-owned-evidence-system";
      rawArtifactUploadAccepted: false;
      secretValuesAccepted: false;
    };
    evidenceUrlPolicy: {
      requiredProtocol: "https";
      institutionOwnedRequired: true;
      evidenceUrlRequiredForProductionEvidence: true;
      evidenceUrlRequiredForEvidenceIds: string[];
      specificEvidencePathRequired: true;
      senaAppOriginRequiredForProductionEvidence: true;
      senaAppOriginConfigured: boolean;
      senaAppOriginHash?: string;
      embeddedCredentialsRejected: true;
      fragmentsRejected: true;
      sensitiveQueryParametersRejected: true;
      rejectedSensitiveQueryParameters: string[];
      forbiddenHostKinds: Array<"local-or-private" | "sena-application-origin" | "reserved-example-or-test">;
      allowedHostConfigStatus?: "configured" | "invalid";
      allowedHostConfigRequiredInProduction?: true;
      allowedHostCount?: number;
      invalidAllowedHostCount?: number;
      allowedHostHashes?: string[];
    };
    ownerRolePolicy: {
      forbiddenTokens: string[];
      institutionOwnerTokens: string[];
      requiredSemanticTokensByDecision: Record<SenaEnterpriseIdentityProductionDecisionId, string[]>;
    };
    notesPolicy: {
      secretValuesRejected: true;
      bearerTokensRejected: true;
      rejectedSensitiveAssignmentNames: string[];
    };
    freeTextPolicy: {
      secretValuesRejected: true;
      bearerTokensRejected: true;
      fields: Array<"ownerName" | "ownerRole" | "environment" | "notes">;
      rejectedSensitiveAssignmentNames: string[];
    };
  };
	  requests: Array<{
	    decisionId: SenaEnterpriseIdentityProductionDecisionId;
	    label: string;
	    status: SenaEnterpriseOrganizationDeploymentDecision["status"] | SenaEnterprisePlatformDecisionAcceptanceStatus;
	    acceptedBridge: boolean;
	    blocking: boolean;
	    ownerRole?: string;
	    environment?: string;
	    evidenceUrlHash?: string;
	    evidenceUrlPathHash?: string;
	    requestedProductionEvidenceIds: string[];
	    acceptedProductionEvidenceIds: string[];
	    missingProductionEvidenceIds: string[];
	    technicalPrerequisiteEvidenceIds: string[];
	    missingTechnicalPrerequisiteEvidenceIds: string[];
	    latestReceiptVerifierStatus?: "ready" | "review";
	    latestReceiptTechnicalBindingStatus?: "current" | "stale" | "not-required";
	    latestReceiptTechnicalReadinessStatus?: "ready" | "review" | "not-required";
	    latestReceiptEvidenceUrlHostBindingStatus?: "current" | "stale" | "not-required";
	    latestReceiptRequestPacketPolicyBindingStatus?: "current" | "stale" | "not-required";
	    latestReceiptRotationFreshnessStatus?: SenaEnterpriseIdentityRotationFreshness["status"];
	    latestReceiptRotationExpiredEvidenceIds?: string[];
	    latestReceiptRotationDueSoonEvidenceIds?: string[];
	    technicalEvidenceBinding?: SenaEnterpriseIdentityTechnicalEvidenceBinding;
	    nextActions: string[];
	    acceptanceCriteria: string[];
	    submissionTemplate: {
	      teamIdField: "teamId";
	      decisionId: SenaEnterpriseIdentityProductionDecisionId;
	      status: "accepted";
	      acceptedBridge: true;
	      ownerNamePlaceholder: string;
	      ownerNamePolicy: {
	        specificInstitutionOwnerRequired: true;
	        genericPlaceholderRejected: true;
	        rejectedPlaceholderNames: string[];
	      };
	      ownerRolePlaceholder: string;
	      environmentPlaceholder: string;
	      evidenceUrlPlaceholder: string;
	      productionEvidenceIds: string[];
	      productionEvidenceArtifactDigestField: "productionEvidenceArtifactDigest";
	      productionEvidenceArtifactDigestPolicy: {
	        required: true;
	        algorithm: "sha256";
	        scope: "external-evidence-artifact";
	        requiredForEvidenceIds: string[];
	        artifactCustody: "institution-owned-evidence-system";
	        rawArtifactUploadAccepted: false;
	        secretValuesAccepted: false;
	        responseHeader: "x-sena-identity-production-evidence-artifact-digest";
	      };
	      productionEvidenceVerifiedAtField: "productionEvidenceVerifiedAt";
	      productionEvidenceVerifiedAtRequiredForEvidenceIds: string[];
	      productionEvidenceVerifiedAtPolicy: {
	        required: true;
	        requiredForEvidenceIds: string[];
	        validPastOrPresentRequired: true;
	        futureTimestampsRejected: true;
	        canonicalIsoTimestampRequired: true;
	      };
	      rotationFreshnessPolicy: {
	        maxAgeDays: number;
	        warningDays: number;
	        rotationEvidenceIds: string[];
	        expiredEvidenceBlocksRelease: true;
	        dueSoonEvidenceWarns: true;
	      };
	      requestPacketPolicyHash: string;
	      submissionDraft: {
	        teamId: string;
	        decisionId: SenaEnterpriseIdentityProductionDecisionId;
	        status: "accepted";
	        acceptedBridge: true;
	        ownerName: string;
	        ownerRole: string;
	        environment: string;
        evidenceUrl: string;
        productionEvidenceIds: string[];
        productionEvidenceArtifactDigest: string;
        productionEvidenceVerifiedAt: string;
	        requestPacketPolicyHash: string;
	        notes: string;
	      };
	      notesTemplate: string;
	    };
	  }>;
  evidence: string[];
};

export type SenaEnterpriseIdentitySubmissionVerifier = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier;
  generatedAt: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    evidenceUrlsHashed: true;
  };
  summary: {
    expectedDecisions: number;
    verifiedDecisions: number;
    incompleteDecisions: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
  };
  expectedSubmissions: Array<{
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    requestPacketSchemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1";
    requiredAcceptedStatus: "accepted";
    requiredAcceptedBridge: true;
    evidenceUrlRequired: boolean;
    verifierStatus: "ready" | "review";
    expectedProductionEvidenceIds: string[];
    matchedRequestEvidenceIds: string[];
    unexpectedEvidenceIds: string[];
    stillMissingEvidenceIds: string[];
    technicalPrerequisiteEvidenceIds: string[];
    missingTechnicalPrerequisiteEvidenceIds: string[];
    requestPacketPolicyHash?: string;
    submittedRequestPacketPolicyHash?: string;
    requestPacketPolicyBindingStatus?: "current" | "stale" | "not-required";
    evidenceUrlHash?: string;
    evidenceUrlPathHash?: string;
  }>;
  evidence: string[];
};

export type SenaEnterpriseIdentityCutoverChecklist = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist;
  generatedAt: string;
  status: "ready" | "review";
  summary: {
    items: number;
    readyItems: number;
    blockingItems: number;
    artifactCompletenessCounts: Partial<Record<"complete" | "partial" | "missing", number>>;
  };
  items: Array<{
    id: "idp-tenant-approval" | "sso-secret-custody" | "scim-idp-ownership" | "identity-secret-rotation";
    label: string;
    status: "ready" | "review";
    source: "platform-acceptance" | "technical-readiness" | "mixed";
    decisionIds: SenaEnterpriseIdentityProductionDecisionId[];
    evidenceIds: string[];
    acceptedEvidenceIds: string[];
    presentEvidenceIds: string[];
    missingEvidenceIds: string[];
    artifactCompletenessStatus: "complete" | "partial" | "missing";
    nextActions: string[];
  }>;
  evidence: string[];
};

export type SenaEnterpriseIdentityReceiptArchiveManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityReceiptArchiveManifest;
  generatedAt: string;
  archiveManifestDigestAlgorithm?: "sha256";
  archiveManifestDigestScope?: "identity-receipt-archive-manifest";
  archiveManifestDigest?: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    ownerNamesHashed: true;
    productionEvidenceTimestampsHashed: true;
  };
  archivePolicy: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"];
  summary: {
    decisions: number;
    readyForArchive: number;
    reviewArchives: number;
    missingReceipts: number;
    missingArchiveInputCounts: Partial<Record<SenaEnterpriseIdentityReceiptArchiveMissingInput, number>>;
    artifactCompletenessCounts: Partial<Record<"complete" | "partial" | "missing", number>>;
    digestHeader: "x-sena-identity-production-receipt-digest";
    stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest";
    archiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
  };
  decisions: Array<{
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    archiveStatus: "ready-for-archive" | "review" | "missing-receipt";
    receiptVerifierStatus?: "ready" | "review";
    digestHeader: "x-sena-identity-production-receipt-digest";
    receiptAuditDigest?: string;
    receiptAuditDigestScope?: "current-validation-snapshot";
    stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest";
    submittedEvidenceDigest?: string;
    submittedEvidenceDigestScope?: "platform-submission-inputs";
    productionEvidenceArtifactDigestAlgorithm?: "sha256";
    productionEvidenceArtifactDigestScope?: "external-evidence-artifact";
    productionEvidenceArtifactDigest?: string;
    productionEvidenceArtifactDigestCoveredEvidenceIds?: string[];
    productionEvidenceArtifactDigestCoverageStatus?: "covered" | "missing";
    productionEvidenceArtifactDigestCompletenessStatus?: "complete" | "partial" | "missing";
    responseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
    archiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
    missingArchiveInputs: SenaEnterpriseIdentityReceiptArchiveMissingInput[];
    requestPacketPolicyBindingStatus?: "current" | "stale" | "not-required";
    technicalBindingStatus?: "current" | "stale" | "not-required";
    technicalReadinessStatus?: "ready" | "review" | "not-required";
    evidenceUrlHostBindingStatus?: "current" | "stale" | "not-required";
    rotationFreshnessStatus?: SenaEnterpriseIdentityRotationFreshness["status"];
    nextAction: string;
  }>;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseIdentityInstitutionActionLaneId =
  "institution-idp-owner" |
  "institution-provisioning-owner";

export type SenaEnterpriseIdentityInstitutionActionOwnerRole =
  "Institution IdP owner" |
  "Institution provisioning owner";

export type SenaEnterpriseIdentitySubmissionMatrix = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionMatrix;
  generatedAt: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    ownerNamesExcluded: true;
    submissionDraftEvidenceUrlFieldOnly: true;
  };
  summary: {
    rows: number;
    blockingRows: number;
    platformEvidenceRows: number;
    technicalPrerequisiteRows: number;
    rotationRows: number;
    requiredArtifactDigestRows: number;
    requiredVerifiedAtRows: number;
    requiredEvidenceUrlRows: number;
  };
  rows: Array<{
    laneId: SenaEnterpriseIdentityInstitutionActionLaneId;
    ownerRole: SenaEnterpriseIdentityInstitutionActionOwnerRole;
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    evidenceId: string;
    label: string;
    evidenceSource: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
    status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
    productionRequired: boolean;
    blocking: boolean;
    cutoverItemIds: SenaEnterpriseIdentityCutoverChecklist["items"][number]["id"][];
    submissionRequired: boolean;
    technicalPrerequisite: boolean;
    rotationEvidence: boolean;
    requiredBodyFields: string[];
    requiresEvidenceUrl: boolean;
    requiresProductionEvidenceArtifactDigest: boolean;
    requiresProductionEvidenceVerifiedAt: boolean;
    requestPacketPolicyHash?: string;
    responseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
    receiptArchiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
    nextAction: string;
  }>;
  evidence: string[];
};

export type SenaEnterpriseIdentityOwnerRunbooks = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityOwnerRunbook;
  generatedAt: string;
  digestAlgorithm?: "sha256";
  digestScope?: "identity-owner-runbook";
  digest?: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    ownerNamesExcluded: true;
    submissionDraftEvidenceUrlFieldOnly: true;
  };
  summary: {
    lanes: number;
    blockingRunbooks: number;
    preflightChecks: number;
    submissionSteps: number;
    receiptArchiveSteps: number;
    releaseGateBlockers: number;
  };
  runbooks: Array<{
    laneId: SenaEnterpriseIdentityInstitutionActionLaneId;
    ownerRole: SenaEnterpriseIdentityInstitutionActionOwnerRole;
    status: "ready" | "review";
    decisionIds: SenaEnterpriseIdentityProductionDecisionId[];
    cutoverItemIds: SenaEnterpriseIdentityCutoverChecklist["items"][number]["id"][];
    missingProductionEvidenceIds: string[];
    missingTechnicalPrerequisiteEvidenceIds: string[];
    rotationEvidenceIds: string[];
    preflightChecks: Array<{
      id: string;
      label: string;
      status: "ready" | "review";
      required: boolean;
      envVars: string[];
      evidenceIds: string[];
      nextAction: string;
    }>;
    submissionSteps: Array<{
      decisionId: SenaEnterpriseIdentityProductionDecisionId;
      method: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["method"];
      path: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["path"];
      requiredAcceptedStatus: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["requiredAcceptedStatus"];
      requiredAcceptedBridge: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["requiredAcceptedBridge"];
      requiredBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["requiredBodyFields"];
      identityProductionEvidenceBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["identityProductionEvidenceBodyFields"];
      productionEvidenceIds: string[];
      requestPacketPolicyHash: string;
      requiresEvidenceUrl: boolean;
      requiresProductionEvidenceArtifactDigest: boolean;
      requiresProductionEvidenceVerifiedAt: boolean;
      responseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
    }>;
    receiptArchiveSteps: Array<{
      decisionId: SenaEnterpriseIdentityProductionDecisionId;
      archiveStatus: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number]["archiveStatus"];
      requiredHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
      requiredBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
      missingArchiveInputs: SenaEnterpriseIdentityReceiptArchiveMissingInput[];
    }>;
    releaseGateBlockers: string[];
    nextActions: string[];
  }>;
  evidence: string[];
};

export type SenaEnterpriseIdentityInstitutionActionPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityInstitutionActionPlan;
  generatedAt: string;
  status: "ready" | "review";
  digestAlgorithm?: "sha256";
  digestScope?: "identity-institution-action-plan";
  digest?: string;
  redaction: {
    secretValuesExcluded: true;
    evidenceUrlValuesExcluded: true;
    ownerNamesExcluded: true;
    submissionDraftEvidenceUrlFieldOnly: true;
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
    id: SenaEnterpriseIdentityInstitutionActionLaneId;
    ownerRole: SenaEnterpriseIdentityInstitutionActionOwnerRole;
    status: "ready" | "review";
    blocking: boolean;
    decisionIds: SenaEnterpriseIdentityProductionDecisionId[];
    cutoverItemIds: SenaEnterpriseIdentityCutoverChecklist["items"][number]["id"][];
    missingProductionEvidenceIds: string[];
    missingTechnicalPrerequisiteEvidenceIds: string[];
    rotationEvidenceIds: string[];
    rotationExpiredEvidenceIds: string[];
    rotationDueSoonEvidenceIds: string[];
    requestPacketPolicyBindingStatuses: Array<"current" | "stale" | "not-required" | "missing">;
    receiptArchiveStatuses: Array<"ready-for-archive" | "review" | "missing-receipt">;
    artifactCompletenessStatuses: Array<"complete" | "partial" | "missing">;
    submissionDrafts: Array<{
      decisionId: SenaEnterpriseIdentityProductionDecisionId;
      submissionDraft: {
        teamId: string;
        decisionId: SenaEnterpriseIdentityProductionDecisionId;
        status: "accepted";
        acceptedBridge: true;
        ownerName: string;
        ownerRole: string;
        environment: string;
        evidenceUrlField: "evidenceUrl";
        productionEvidenceIds: string[];
        productionEvidenceArtifactDigest: string;
        productionEvidenceVerifiedAt: string;
        requestPacketPolicyHash: string;
        notesTemplate: string;
      };
    }>;
    responseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
    receiptArchiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
    nextActions: string[];
  }>;
  submissionMatrix: SenaEnterpriseIdentitySubmissionMatrix;
  ownerRunbooks: SenaEnterpriseIdentityOwnerRunbooks;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseIdentityProductionEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence;
  generatedAt: string;
  status: "ready" | "review";
  dossierDigestAlgorithm?: "sha256";
  dossierDigestScope?: "identity-production-evidence-dossier";
  dossierDigest?: string;
  evidenceBindingDigestAlgorithm?: "sha256";
  evidenceBindingDigestScope?: "identity-production-evidence-binding";
  evidenceBindingDigest?: string;
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    evidenceUrlsHashed: true;
    ownerNamesHashed: true;
    productionEvidenceTimestampsHashed: true;
  };
  summary: {
    productionRequired: number;
    accepted: number;
    present: number;
    missing: number;
    platformBlocking: number;
    technicalBlocking: number;
  };
  capability: Pick<SenaEnterpriseCapabilityAuditItem, "id" | "status" | "evidence" | "remainingPlatformDecisions" | "nextAction">;
  decisions: Array<{
    id: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: SenaEnterpriseOrganizationDeploymentDecision["status"];
    productionBlocking: boolean;
    acceptedBridge: boolean;
    ownerEvidence: string[];
    acceptanceCriteria: string[];
  }>;
  acceptanceReceipts: Array<{
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    status: SenaEnterprisePlatformDecisionAcceptanceStatus;
    acceptedBridge: boolean;
    ownerNameHash?: string;
    productionEvidenceVerifiedAtHash?: string;
    ownerRole: string;
    environment: string;
    evidenceUrlHash?: string;
    evidenceUrlPathHash?: string;
    evidenceUrlHostHash?: string;
    evidenceUrlAllowedHostHash?: string;
    productionEvidenceReceipt?: SenaEnterprisePlatformDecisionProductionEvidenceReceipt;
    updatedAt: string;
  }>;
  requirements: Array<{
    id: string;
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
    productionRequired: boolean;
    source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
    evidence: string[];
    nextAction: string;
  }>;
  evidenceManifest: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidenceManifest;
    requiredEvidenceIds: string[];
    acceptedEvidenceIds: string[];
    presentEvidenceIds: string[];
    missingEvidenceIds: string[];
    platformAcceptanceEvidenceIds: string[];
    technicalReadinessEvidenceIds: string[];
    byDecision: Array<{
      decisionId: SenaEnterpriseIdentityProductionDecisionId;
      requiredEvidenceIds: string[];
      acceptedEvidenceIds: string[];
      presentEvidenceIds: string[];
      missingEvidenceIds: string[];
    }>;
  };
  releaseGate: {
    approvalBlocked: boolean;
    productionBlockingDecisionIds: string[];
    missingProductionEvidence: SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"]["missingProductionEvidence"];
  };
  rotationFreshness: SenaEnterpriseIdentityRotationFreshness;
  evidenceUrlHostBinding: SenaEnterpriseIdentityEvidenceUrlHostBinding;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  submissionVerifier: SenaEnterpriseIdentitySubmissionVerifier;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
  institutionActionPlan: SenaEnterpriseIdentityInstitutionActionPlan;
  evidence: string[];
  nextActions: string[];
};

const enterprisePlatformDecisionIds = [
  "native-managed-database",
  "native-managed-object-storage",
  "native-collaboration-pubsub",
  "institution-idp-approval",
  "institution-provisioning-owner",
  "deployment-alerting-escalation",
  "native-audit-siem-adapter",
  "institution-email-provider",
  "native-managed-backup-storage",
  "full-saas-backend-operations"
] as const;

const enterprisePlatformDecisionAcceptanceStatuses = [
  "accepted",
  "rejected",
  "needs-native-adapter",
  "superseded"
] as const;

const enterpriseReleaseGateDecisions = [
  "approved",
  "blocked",
  "conditional"
] as const;

function isEnterprisePlatformDecisionId(decisionId: string) {
  return (enterprisePlatformDecisionIds as readonly string[]).includes(decisionId);
}

function isEnterprisePlatformDecisionAcceptanceStatus(status: string): status is SenaEnterprisePlatformDecisionAcceptanceStatus {
  return (enterprisePlatformDecisionAcceptanceStatuses as readonly string[]).includes(status);
}

function isEnterpriseReleaseGateDecision(status: string): status is SenaEnterpriseReleaseGateDecision {
  return (enterpriseReleaseGateDecisions as readonly string[]).includes(status);
}

function isEnterpriseReleaseVerificationStatus(status: string): status is SenaEnterpriseReleaseVerificationStatus {
  return status === "passed" || status === "failed" || status === "not-run";
}

export type SenaEnterpriseOrganizationDeploymentPackage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    secretHashingDisabled: true;
  };
  baseUrl: {
    configured: boolean;
    origin: string;
    originHash: string;
    callbackPath: string;
  };
  environment: {
    nodeEnv: string;
    runtime: "nodejs";
    storageEngine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
  };
  access: {
    api: "/api/sena/ops/deployment";
    auth: "ops-bearer-token-or-session";
    opsTokenConfigured: boolean;
  };
  summary: {
    requiredEnv: number;
    configuredRequiredEnv: number;
    missingRequiredEnv: string[];
    configuredSecrets: number;
    configuredWebhookBridges: number;
    openPlatformDecisions: number;
    acceptedPlatformDecisions: number;
    identityProductionStatus: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"];
    identitySubmissionVerifierIncomplete: number;
    identityRotationFreshness: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"];
    identityEvidenceUrlHostBinding: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["status"];
    identityEvidenceAllowedHostConfig: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["allowedHostConfigStatus"];
    identityEvidenceAllowedHosts: number;
    identityEvidenceInvalidAllowedHosts: number;
    blockingReview: number;
    advisoryReview: number;
  };
  readiness: {
    schemaVersion: SenaEnterpriseDeploymentReadiness["schemaVersion"];
    status: SenaEnterpriseDeploymentReadiness["status"];
    blockers: string[];
    blockingReview: number;
    advisoryReview: number;
  };
  governance: {
    schemaVersion: SenaEnterpriseGovernanceStatus["schemaVersion"];
    status: SenaEnterpriseGovernanceStatus["status"];
    checksPass: number;
    checksReview: number;
    keyChecks: Array<Pick<SenaEnterpriseGovernanceCheck, "id" | "status" | "evidence" | "nextAction">>;
  };
  oidc: Array<{
    provider: SenaEnterpriseSsoProvider;
    mode: SenaEnterpriseSsoProviderStatus["mode"];
    configured: boolean;
    missingEnv: string[];
  }>;
  env: SenaEnterpriseOrganizationDeploymentEnv[];
  serviceEndpoints: Array<{
    id: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    auth: "session" | "ops-bearer-or-session" | "provisioning-bearer" | "team-rbac";
    schema?: string;
    purpose: string;
  }>;
  platformDecisions: SenaEnterpriseOrganizationDeploymentDecision[];
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  nativeAdapterCertification: SenaEnterpriseNativeAdapterCertification;
  saasOperationsReadiness: SenaEnterpriseSaasOperationsReadiness;
  identityProductionEvidence: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"];
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  releaseGate: {
    schemaVersion: SenaEnterpriseReleaseGateReviewList["schemaVersion"];
    generatedAt: string;
    summary: SenaEnterpriseReleaseGateReviewList["summary"];
    latestReview?: {
      schemaVersion: SenaEnterpriseReleaseGateReview["schemaVersion"];
      id: string;
      teamId: string;
      environment: string;
      releaseVersion: string;
      decision: SenaEnterpriseReleaseGateDecision;
      verificationCommand: string;
      verificationEvidence: SenaEnterpriseReleaseVerificationEvidence;
      readinessSnapshot: SenaEnterpriseReleaseGateReview["readinessSnapshot"];
      platformDecisionSnapshot: SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"];
      identityProductionSnapshot?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"];
      approverRole: string;
      updatedAt: string;
    };
    evidence: string[];
  };
  verification: {
    commands: string[];
    releaseGate: "npm run sena:pilot:verify";
  };
};

export type SenaEnterpriseSsoProviderStatus = {
  provider: SenaEnterpriseSsoProvider;
  configured: boolean;
  clientId?: string;
  scopes?: string;
  clientSecretStrength: "configured" | "weak" | "missing";
  endpointHostPolicy: "production" | "not-required" | "missing" | "invalid" | "non-https" | "local-or-private" | "sena-application-origin" | "reserved-example-or-test";
  mode: "oauth-oidc" | "local-pilot-fallback";
  fallbackPolicy: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy;
    enabled: boolean;
    productionRuntime: boolean;
    explicitOverride: boolean;
    env: "SENA_ALLOW_LOCAL_SSO_FALLBACK";
  };
  requiredEnv: string[];
  missingEnv: string[];
  discoveryUrl?: string;
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUrl?: string;
};

export type SenaEnterpriseSsoProviderPreflight = {
  provider: SenaEnterpriseSsoProvider;
  status: "pass" | "review";
  mode: "oauth-oidc" | "local-pilot-fallback";
  configured: boolean;
  generatedAt: string;
  callbackUrl?: string;
  endpointHashes: {
    discovery?: string;
    issuer?: string;
    authorization?: string;
    token?: string;
    userinfo?: string;
    jwks?: string;
    callback?: string;
  };
  checks: SenaEnterpriseGovernanceCheck[];
  errorCode?: string;
  errorHash?: string;
};

export type SenaEnterpriseSsoProviderPreflightResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight;
  generatedAt: string;
  baseUrl: string;
  summary: {
    checked: number;
    passed: number;
    review: number;
    configuredProviders: number;
  };
  providers: SenaEnterpriseSsoProviderPreflight[];
};

export type SenaEnterpriseGovernanceStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGovernance;
  status: "ready" | "review";
  generatedAt: string;
  storage: {
    engine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
    postgres?: SenaEnterprisePostgresStorageEvidence;
  };
  auth: {
    passwordHash: "pbkdf2-sha256";
    ssoModes: SenaEnterpriseSsoProvider[];
    oidcProviders: SenaEnterpriseSsoProviderStatus[];
    callbackPath: string;
    sessionCookie: string;
    sessionDays: number;
    sessionPolicy: {
      standardDays: number;
      rememberedDays: number;
    };
    loginLockout: {
      maxFailures: number;
      windowMinutes: number;
      lockoutMinutes: number;
      activeLockouts: number;
    };
    mfa: {
      methods: Array<"totp">;
      enabledUsers: number;
      challengeMinutes: number;
      setupMinutes: number;
      secretStorage: "aes-256-gcm";
      keySource: "env-configured" | "local-default-review";
    };
    passwordReset: {
      expiresMinutes: number;
      activeRequests: number;
      delivery: "email-provider-required" | "email-webhook" | "local-token";
    };
    passwordPolicy: {
      schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordPolicy;
      minLength: number;
      requiresLetter: boolean;
      requiresNumber: boolean;
      blocksCommonPasswords: boolean;
      blocksEmailLocalPart: boolean;
      blockedFragments: string[];
    };
  };
  rbac: {
    roles: SenaEnterpriseRole[];
    permissions: SenaEnterprisePermission[];
  };
  counts: {
    users: number;
    teams: number;
    projects: number;
    uploads: number;
    importRuns: number;
    analysisRuns: number;
    reliabilityRuns: number;
    validationRuns: number;
    expertReviews: number;
    platformDecisionAcceptances: number;
    releaseGateReviews: number;
    postCutoverObservations: number;
    goLiveAttestations: number;
    projectRevisions: number;
    comments: number;
    adjudications: number;
    collaborationEvents: number;
    notifications: number;
    auditEvents: number;
  };
  checks: SenaEnterpriseGovernanceCheck[];
};

export type SenaEnterpriseBackupRecordCounts = {
  users: number;
  teams: number;
  memberships: number;
  invitations: number;
  uploads: number;
  importRuns: number;
  analysisRuns: number;
  projects: number;
  projectRevisions: number;
  comments: number;
  adjudications: number;
  reliabilityRuns: number;
  validationRuns: number;
  expertReviews: number;
  platformDecisionAcceptances: number;
  releaseGateReviews: number;
  postCutoverObservations: number;
  goLiveAttestations: number;
  notifications: number;
  auditEvents: number;
};

export type SenaEnterpriseBackupPayload = {
  users: Array<Omit<SenaEnterpriseUser, "passwordHash">>;
  teams: SenaEnterpriseTeam[];
  memberships: SenaEnterpriseMembership[];
  invitations: SenaEnterpriseInvitation[];
  uploads: SenaEnterpriseUpload[];
  importRuns: SenaEnterpriseImportRun[];
  analysisRuns: SenaEnterpriseAnalysisRun[];
  projects: SenaEnterpriseProject[];
  projectRevisions: SenaEnterpriseProjectRevision[];
  projectComments: SenaEnterpriseProjectComment[];
  adjudications: SenaEnterpriseAdjudicationRecord[];
  reliabilityRuns: SenaEnterpriseReliabilityRun[];
  validationRuns: SenaEnterpriseValidationRun[];
  expertReviews: SenaEnterpriseExpertReview[];
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  releaseGateReviews: SenaEnterpriseReleaseGateReview[];
  postCutoverObservations: SenaEnterprisePostCutoverObservation[];
  goLiveAttestations: SenaEnterpriseGoLiveAttestation[];
  notifications: SenaEnterpriseNotification[];
  auditLog: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseBackupArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackup;
  backupId: string;
  generatedAt: string;
  generatedBy: {
    userId: string;
    email: string;
    name: string;
  };
  scope: {
    mode: "managed-teams" | "selected-team";
    teamIds: string[];
    uploadBlobsIncluded: false;
    excludedCollections: string[];
  };
  manifest: {
    storageEngine: "file-backed-json";
    storagePathHint: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    retentionPolicy: {
      auditEventsMax: number;
      sessionsExcluded: true;
      ssoStatesExcluded: true;
      authLockoutsExcluded: true;
      apiRateLimitsExcluded: true;
      mfaSecretsExcluded: true;
      mfaChallengesExcluded: true;
      emailDeliveriesExcluded: true;
      passwordResetTokensExcluded: true;
      presenceExcluded: true;
      collaborationPubSubExcluded: true;
      passwordHashesExcluded: true;
      uploadBlobsExcluded: true;
    };
  };
  payload: SenaEnterpriseBackupPayload;
};

export type SenaEnterpriseBackupVerification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupVerification;
  status: "pass" | "review";
  generatedAt: string;
  backupId: string;
  backupGeneratedAt: string;
  payloadSha256: string;
  recordCounts: SenaEnterpriseBackupRecordCounts;
  conflicts: {
    teams: string[];
    projects: string[];
    uploads: string[];
  };
  checks: SenaEnterpriseGovernanceCheck[];
};

export type SenaEnterpriseBackupDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupDelivery;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
  };
  backup: {
    backupId: string;
    generatedAt: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    scope: SenaEnterpriseBackupArtifact["scope"];
  };
  verification: SenaEnterpriseBackupVerification;
  delivery: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
};

export type SenaEnterpriseDatabaseSyncResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDatabaseSync;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: "webhook" | "local-sink" | "postgres-native" | "not-configured";
    configured: boolean;
    endpointHash?: string;
    urlEnvName?: string;
    connectionHash?: string;
    adapter?: "postgres" | "neon";
    secretConfigured: boolean;
    timeoutMs: number;
  };
  backup: {
    backupId: string;
    generatedAt: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    scope: SenaEnterpriseBackupArtifact["scope"];
  };
  verification: SenaEnterpriseBackupVerification;
  sync: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    nativeStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    revision?: number;
    adapter?: "postgres" | "neon";
    errorCode?: string;
    errorHash?: string;
  };
};

export type SenaEnterpriseBackupRestoreResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupRestore;
  status: "completed" | "dry-run";
  mode: "merge";
  generatedAt: string;
  backupId: string;
  dryRun: boolean;
  payloadSha256: string;
  verification: SenaEnterpriseBackupVerification;
  summary: {
    usersCreated: number;
    usersUpdated: number;
    teamsCreated: number;
    teamsUpdated: number;
    membershipsCreated: number;
    membershipsUpdated: number;
    invitationsCreated: number;
    invitationsUpdated: number;
    uploadsCreated: number;
    uploadsUpdated: number;
    importRunsCreated: number;
    importRunsUpdated: number;
    analysisRunsCreated: number;
    analysisRunsUpdated: number;
    projectsCreated: number;
    projectsUpdated: number;
    projectRevisionsCreated: number;
    projectRevisionsUpdated: number;
    commentsCreated: number;
    commentsUpdated: number;
    adjudicationsCreated: number;
    adjudicationsUpdated: number;
    reliabilityRunsCreated: number;
    reliabilityRunsUpdated: number;
    validationRunsCreated: number;
    validationRunsUpdated: number;
    expertReviewsCreated: number;
    expertReviewsUpdated: number;
    platformDecisionAcceptancesCreated: number;
    platformDecisionAcceptancesUpdated: number;
    releaseGateReviewsCreated: number;
    releaseGateReviewsUpdated: number;
    postCutoverObservationsCreated: number;
    postCutoverObservationsUpdated: number;
    goLiveAttestationsCreated: number;
    goLiveAttestationsUpdated: number;
    notificationsCreated: number;
    notificationsUpdated: number;
    auditEventsCreated: number;
    auditEventsUpdated: number;
  };
};

export type SenaEnterpriseDb = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDb;
  users: SenaEnterpriseUser[];
  teams: SenaEnterpriseTeam[];
  memberships: SenaEnterpriseMembership[];
  invitations: SenaEnterpriseInvitation[];
  sessions: SenaEnterpriseSession[];
  ssoStates: SenaEnterpriseSsoState[];
  authLockouts: SenaEnterpriseAuthLockout[];
  apiRateLimits: SenaEnterpriseApiRateLimit[];
  mfaFactors: SenaEnterpriseMfaFactor[];
  mfaSetups: SenaEnterpriseMfaSetup[];
  mfaChallenges: SenaEnterpriseMfaChallenge[];
  passwordResetRequests: SenaEnterprisePasswordResetRequest[];
  uploads: SenaEnterpriseUpload[];
  importRuns: SenaEnterpriseImportRun[];
  analysisRuns: SenaEnterpriseAnalysisRun[];
  projects: SenaEnterpriseProject[];
  projectRevisions: SenaEnterpriseProjectRevision[];
  projectComments: SenaEnterpriseProjectComment[];
  projectPresence: SenaEnterpriseProjectPresence[];
  adjudications: SenaEnterpriseAdjudicationRecord[];
  collaborationEvents: SenaEnterpriseCollaborationPubSubEvent[];
  reliabilityRuns: SenaEnterpriseReliabilityRun[];
  validationRuns: SenaEnterpriseValidationRun[];
  expertReviews: SenaEnterpriseExpertReview[];
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  releaseGateReviews: SenaEnterpriseReleaseGateReview[];
  postCutoverObservations: SenaEnterprisePostCutoverObservation[];
  goLiveAttestations: SenaEnterpriseGoLiveAttestation[];
  notifications: SenaEnterpriseNotification[];
  emailDeliveries: SenaEnterpriseEmailDelivery[];
  auditLog: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseSessionContext = {
  user: SenaEnterpriseUser;
  session: SenaEnterpriseSession;
  memberships: SenaEnterpriseMembership[];
  teams: SenaEnterpriseTeam[];
};

export class SenaEnterpriseError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "sena_enterprise_error"
  ) {
    super(message);
  }
}

export const rolePermissions: Record<SenaEnterpriseRole, SenaEnterprisePermission[]> = {
  owner: ["team:manage", "member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  pi: ["team:manage", "member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  admin: ["member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  coder: ["upload:create", "upload:read", "project:create", "project:read", "project:update", "project:comment", "reliability:adjudicate", "analysis:run", "export:create"],
  reviewer: ["upload:read", "project:read", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  viewer: ["upload:read", "project:read", "export:create"]
};

const auditRetentionMaxEvents = 5000;
const postCutoverObservationMinutes = 60;
const postCutoverObservationCadenceMinutes = 7;

export const enterpriseAuditEvents: SenaEnterpriseAuditEvent[] = [
  "auth.register",
  "auth.login",
  "auth.login.failed",
  "auth.login.locked",
  "auth.mfa.setup",
  "auth.mfa.enable",
  "auth.mfa.challenge",
  "auth.mfa.verify",
  "auth.mfa.disable",
  "auth.password_reset.request",
  "auth.password_reset.complete",
  "auth.logout",
  "auth.session.revoke",
  "auth.sso",
  "auth.sso.preflight.pass",
  "auth.sso.preflight.fail",
  "security.csrf.fail",
  "security.rate_limit",
  "notification.queue",
  "notification.read",
  "notification.webhook.deliver",
  "notification.webhook.fail",
  "email.queue",
  "email.webhook.deliver",
  "email.webhook.fail",
  "provisioning.sync",
  "team.invite",
  "team.invite.accept",
  "team.invite.revoke",
  "team.membership.update",
  "project.create",
  "project.read",
  "project.update",
  "project.restore",
  "project.delete",
  "project.comment",
  "project.comment.resolve",
  "project.presence",
  "project.adjudicate",
  "collaboration.pubsub.deliver",
  "collaboration.pubsub.fail",
  "upload.create",
  "upload.object_storage.deliver",
  "upload.object_storage.fail",
  "analysis.run",
  "import.run",
  "reliability.run",
  "reliability.adjudicate",
  "reliability.review",
  "expert.review",
  "inference.run",
  "validation.review",
  "export.run",
  "governance.backup",
  "governance.backup.verify",
  "governance.backup.deliver",
  "governance.backup.deliver.fail",
  "governance.database_sync.deliver",
  "governance.database_sync.fail",
  "ops.alert.deliver",
  "ops.alert.deliver.fail",
  "ops.platform_decision.review",
  "ops.release_gate.review",
  "ops.post_cutover_observation.start",
  "ops.post_cutover_observation.sample",
  "ops.post_cutover_observation.complete",
  "ops.go_live.attestation",
  "governance.backup.restore",
  "governance.audit.export"
];

export function isEnterpriseAuditEvent(value: string): value is SenaEnterpriseAuditEvent {
  return enterpriseAuditEvents.includes(value as SenaEnterpriseAuditEvent);
}

const dbDir = process.env.SENA_ENTERPRISE_DB_DIR || path.join(process.cwd(), ".sena-enterprise");
const dbPath = path.join(dbDir, "enterprise-db.json");
const dbBackupPath = `${dbPath}.bak`;
const dbLockPath = `${dbPath}.lock`;
const standardSessionDays = 7;
const rememberedSessionDays = 30;
const sessionDays = standardSessionDays;
const dbLockTimeoutMs = positiveIntegerEnv("SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS", 5000);
const dbLockPollMs = 25;
const ssoStateMinutes = 10;
const authLockoutMaxFailures = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MAX_FAILURES", 5);
const authLockoutWindowMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_WINDOW_MINUTES", 15);
const authLockoutMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MINUTES", 15);
const authApiRateLimitWindowSeconds = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_WINDOW_SECONDS", 60);
const authApiRateLimitMaxRequests = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_MAX_REQUESTS", 20);
const passwordResetRateLimitWindowSeconds = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS", 15 * 60);
const passwordResetRateLimitMaxRequests = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS", 5);
const ssoRateLimitWindowSeconds = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_WINDOW_SECONDS", 5 * 60);
const ssoRateLimitMaxRequests = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_MAX_REQUESTS", 30);
const mfaSetupMinutes = positiveIntegerEnv("SENA_MFA_SETUP_MINUTES", 10);
const mfaChallengeMinutes = positiveIntegerEnv("SENA_MFA_CHALLENGE_MINUTES", 5);
const mfaTotpStepSeconds = 30;
const mfaTotpDigits = 6;
const mfaTotpWindow = 1;
const mfaIssuer = "SENA.HK";
const passwordResetMinutes = positiveIntegerEnv("SENA_PASSWORD_RESET_MINUTES", 30);
const enterprisePasswordPolicy = {
  schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordPolicy,
  minLength: 12,
  requiresLetter: true,
  requiresNumber: true,
  blocksCommonPasswords: true,
  blocksEmailLocalPart: true,
  blockedFragments: ["password", "123456", "qwerty", "letmein", "welcome", "changeme", "admin"]
};
const ssoCallbackPath = "/api/auth/sso/callback";
const ssoProviders: SenaEnterpriseSsoProvider[] = ["institution", "google", "orcid"];
const uploadScanEngine = "sena-local-upload-scan/v1" as const;
const maxUploadBytes = Number(process.env.SENA_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const allowedUploadExtensions = new Set([".csv", ".json", ".xlsx", ".xls", ".txt", ".md", ".srt", ".vtt"]);
const defaultSsoDiscoveryUrls: Partial<Record<SenaEnterpriseSsoProvider, string>> = {
  google: "https://accounts.google.com/.well-known/openid-configuration",
  orcid: "https://orcid.org/.well-known/openid-configuration"
};

type SenaEnterpriseResolvedSsoProvider = {
  provider: SenaEnterpriseSsoProvider;
  clientId: string;
  clientSecret: string;
  scopes: string;
  callbackUrl: string;
  discoveryUrl?: string;
  issuer?: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  jwksUrl?: string;
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function providerEnvPrefix(provider: SenaEnterpriseSsoProvider) {
  return `SENA_SSO_${provider.toUpperCase()}`;
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

function isSelfManagedIdentityDecision(decisionId: string) {
  return isSelfManagedEnterpriseMode() && isIdentityProductionDecisionId(decisionId);
}

const selfManagedLocalPlatformDecisionIds = new Set([
  "native-managed-database",
  "native-managed-object-storage",
  "native-collaboration-pubsub",
  "deployment-alerting-escalation",
  "institution-email-provider",
  "native-audit-siem-adapter",
  "native-managed-backup-storage",
  "full-saas-backend-operations"
]);

function isSelfManagedLocalPlatformDecision(decisionId: string) {
  return isSelfManagedEnterpriseMode() && selfManagedLocalPlatformDecisionIds.has(decisionId);
}

function selfManagedIdentityEvidence(evidence: string[] = []) {
  return Array.from(new Set([
    ...evidence,
    "enterpriseDeploymentMode=self-managed",
    "selfManagedBoundary=local-enterprise-runtime",
    "institutionIdentityEvidence=not-applicable"
  ]));
}

function selfManagedIdentityNextAction() {
  return "Institution IdP, SCIM, and institution-owned identity evidence are marked not applicable for this explicitly self-managed enterprise deployment; keep local auth, sessions, MFA, CSRF, backup, audit, and release verification evidence current.";
}

function selfManagedIdentityChecklistItems(
  items: SenaEnterprisePlatformDecisionEvidenceChecklistItem[]
): SenaEnterprisePlatformDecisionEvidenceChecklistItem[] {
  if (!isSelfManagedEnterpriseMode()) return items;
  return items.map((item) => ({
    ...item,
    status: "present",
    productionRequired: false,
    evidence: selfManagedIdentityEvidence(item.evidence),
    nextAction: selfManagedIdentityNextAction()
  }));
}

function productionSecretStrength(value: string | undefined, minLength = 32): "configured" | "weak" | "missing" {
  if (!value) return "missing";
  const lower = value.toLowerCase();
  const hasPlaceholderTerm = /(^|[^a-z0-9])(test|dummy|example|placeholder|changeme|change-me|local|dev)([^a-z0-9]|$)/.test(lower);
  return value.length >= minLength && !hasPlaceholderTerm ? "configured" : "weak";
}

function institutionSsoEndpointHostPolicy(urls: Array<string | undefined>): SenaEnterpriseSsoProviderStatus["endpointHostPolicy"] {
  const configuredUrls = urls.filter((url): url is string => Boolean(url));
  if (configuredUrls.length === 0) return "missing";
  const appOrigin = configuredSenaAppOrigin();
  for (const value of configuredUrls) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return "invalid";
    }
    if (url.protocol !== "https:") return "non-https";
    if (appOrigin && url.origin === appOrigin) return "sena-application-origin";
    if (isLocalOrPrivateIdentityEvidenceHost(url.hostname)) return "local-or-private";
    if (isReservedIdentityEvidenceHost(url.hostname)) return "reserved-example-or-test";
  }
  return "production";
}

function ssoEndpointHostPolicy(
  provider: SenaEnterpriseSsoProvider,
  urls: Array<string | undefined>
): SenaEnterpriseSsoProviderStatus["endpointHostPolicy"] {
  return provider === "institution" ? institutionSsoEndpointHostPolicy(urls) : "not-required";
}

function provisioningTokenProductionEvidence() {
  const token = envValue("SENA_PROVISIONING_TOKEN");
  const strength = productionSecretStrength(token);
  return {
    present: Boolean(token),
    ready: strength === "configured",
    strength,
    evidence: [
      `provisioningToken=${token ? "configured" : "missing"}`,
      `provisioningTokenStrength=${strength}`,
      "provisioningTokenMinLength=32"
    ]
  };
}

function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function enterprisePostgresStorageEngine(config = resolveEnterprisePostgresConfig()): SenaEnterpriseStorageEngine {
  if (!config.configured) return "file-backed-json";
  return config.adapter === "neon" ? "neon-postgres" : "postgres";
}

function enterprisePostgresStorageEvidence(
  config: SenaEnterprisePostgresConfig
): SenaEnterprisePostgresStorageEvidence | undefined {
  if (!config.adapterRequested || !config.adapter) return undefined;
  return {
    configured: config.configured,
    adapter: config.adapter,
    urlEnvName: config.urlEnvName,
    connectionHash: config.connectionHash,
    missingEnv: config.missingEnv,
    liveProbe: "not-run"
  };
}

function enterprisePostgresPublicEvidence(config: SenaEnterprisePostgresConfig) {
  return [
    ...config.evidence,
    `missing=${config.missingEnv.join("|") || "none"}`,
    "nativeSchema=sena-enterprise-postgres-adapter/v1",
    "liveProbe=not-run"
  ];
}

function deploymentEnv(input: Omit<SenaEnterpriseOrganizationDeploymentEnv, "configured" | "status"> & {
  configured?: boolean;
  value?: string;
}) {
  const configured = input.configured ?? Boolean(envValue(input.name));
  const env: SenaEnterpriseOrganizationDeploymentEnv = {
    name: input.name,
    category: input.category,
    required: input.required,
    configured,
    secret: input.secret,
    status: input.required && !configured ? "review" : "pass",
    purpose: input.purpose,
    defaultedTo: input.defaultedTo
  };
  if (!input.secret && input.value) env.valueHash = sha256Text(input.value);
  if (input.endpointHash) env.endpointHash = input.endpointHash;
  return env;
}

function deploymentWebhookEnv(
  urlName: string,
  secretName: string,
  provider: { configured: boolean; endpointHash?: string; secretConfigured: boolean },
  category: SenaEnterpriseOrganizationDeploymentEnv["category"],
  purpose: string
) {
  return [
    deploymentEnv({
      name: urlName,
      category,
      required: true,
      configured: provider.configured,
      secret: false,
      endpointHash: provider.endpointHash,
      purpose
    }),
    deploymentEnv({
      name: secretName,
      category,
      required: true,
      configured: provider.secretConfigured,
      secret: true,
      purpose: `${purpose} HMAC signing secret`
    })
  ];
}

function notificationWebhookUrl() {
  const url = envValue("SENA_NOTIFICATION_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_NOTIFICATION_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_notification_webhook_url");
  }
  return parsed.toString();
}

function notificationWebhookSecret() {
  return envValue("SENA_NOTIFICATION_WEBHOOK_SECRET");
}

function notificationWebhookTimeoutMs() {
  return Math.min(30_000, positiveIntegerEnv("SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS", 5000));
}

function notificationWebhookMaxAttempts() {
  return Math.min(10, positiveIntegerEnv("SENA_NOTIFICATION_WEBHOOK_MAX_ATTEMPTS", 3));
}

function notificationWebhookEndpointHash(url = notificationWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function emailWebhookUrl() {
  const url = envValue("SENA_EMAIL_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_EMAIL_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_email_webhook_url");
  }
  return parsed.toString();
}

function emailWebhookSecret() {
  return envValue("SENA_EMAIL_WEBHOOK_SECRET");
}

function emailWebhookTimeoutMs() {
  return Math.min(30_000, positiveIntegerEnv("SENA_EMAIL_WEBHOOK_TIMEOUT_MS", 5000));
}

function emailWebhookMaxAttempts() {
  return Math.min(10, positiveIntegerEnv("SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS", 3));
}

function emailWebhookEndpointHash(url = emailWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function auditWebhookUrl() {
  const url = envValue("SENA_AUDIT_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_AUDIT_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_audit_webhook_url");
  }
  return parsed.toString();
}

function auditWebhookSecret() {
  return envValue("SENA_AUDIT_WEBHOOK_SECRET");
}

function auditWebhookTimeoutMs() {
  return Math.min(30_000, positiveIntegerEnv("SENA_AUDIT_WEBHOOK_TIMEOUT_MS", 5000));
}

function auditWebhookMaxAttempts() {
  return Math.min(10, positiveIntegerEnv("SENA_AUDIT_WEBHOOK_MAX_ATTEMPTS", 3));
}

function auditWebhookEndpointHash(url = auditWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function backupWebhookUrl() {
  const url = envValue("SENA_BACKUP_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_BACKUP_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_backup_webhook_url");
  }
  return parsed.toString();
}

function backupWebhookSecret() {
  return envValue("SENA_BACKUP_WEBHOOK_SECRET");
}

function backupWebhookTimeoutMs() {
  return Math.min(120_000, positiveIntegerEnv("SENA_BACKUP_WEBHOOK_TIMEOUT_MS", 30_000));
}

function backupWebhookEndpointHash(url = backupWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function alertWebhookUrl() {
  const url = envValue("SENA_ALERT_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_ALERT_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_alert_webhook_url");
  }
  return parsed.toString();
}

function alertWebhookSecret() {
  return envValue("SENA_ALERT_WEBHOOK_SECRET");
}

function alertWebhookTimeoutMs() {
  return Math.min(120_000, positiveIntegerEnv("SENA_ALERT_WEBHOOK_TIMEOUT_MS", 30_000));
}

function alertWebhookEndpointHash(url = alertWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function databaseSyncWebhookUrl() {
  const url = envValue("SENA_DATABASE_SYNC_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_DATABASE_SYNC_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_database_sync_webhook_url");
  }
  return parsed.toString();
}

function databaseSyncWebhookSecret() {
  return envValue("SENA_DATABASE_SYNC_WEBHOOK_SECRET");
}

function databaseSyncWebhookTimeoutMs() {
  return Math.min(120_000, positiveIntegerEnv("SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS", 30_000));
}

function databaseSyncWebhookEndpointHash(url = databaseSyncWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function objectStorageWebhookUrl() {
  const url = envValue("SENA_OBJECT_STORAGE_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_OBJECT_STORAGE_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_object_storage_webhook_url");
  }
  return parsed.toString();
}

function objectStorageWebhookSecret() {
  return envValue("SENA_OBJECT_STORAGE_WEBHOOK_SECRET");
}

function objectStorageWebhookTimeoutMs() {
  return Math.min(120_000, positiveIntegerEnv("SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS", 30_000));
}

function objectStorageWebhookEndpointHash(url = objectStorageWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function collaborationPubSubWebhookUrl() {
  const url = envValue("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL must be an HTTP(S) URL.", 500, "invalid_collaboration_pubsub_webhook_url");
  }
  return parsed.toString();
}

function collaborationPubSubWebhookSecret() {
  return envValue("SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET");
}

function collaborationPubSubTimeoutMs() {
  return Math.min(60_000, positiveIntegerEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS", 5000));
}

function collaborationPubSubMaxAttempts() {
  return Math.min(10, positiveIntegerEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_MAX_ATTEMPTS", 3));
}

function collaborationPubSubEndpointHash(url = collaborationPubSubWebhookUrl()) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

function selfManagedLocalWebhookSinkEnabled() {
  const sink = (envValue("SENA_SELF_MANAGED_WEBHOOK_SINK") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  return isSelfManagedEnterpriseMode() && (sink === "local" || sink === "local-sink");
}

function localWebhookSinkEndpointHash(channel: string) {
  return sha256Text(`sena-local-webhook-sink:${channel}:${dbPath}`)!;
}

function localWebhookSinkProvider(channel: string, timeoutMs: number, maxAttempts = 1) {
  return {
    mode: "local-sink" as const,
    configured: true,
    endpointHash: localWebhookSinkEndpointHash(channel),
    secretConfigured: true,
    timeoutMs,
    maxAttempts
  };
}

function webhookQueueProvider(provider: { mode: SenaEnterpriseWebhookProviderMode }): SenaEnterpriseWebhookQueueProvider {
  return provider.mode === "local-sink" ? "local-sink" : "webhook";
}

function localWebhookSinkAttempt(endpointHash: string | undefined) {
  return {
    ok: true,
    endpointHash,
    httpStatus: undefined,
    errorCode: undefined,
    errorHash: undefined
  };
}

function notificationWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("notification", notificationWebhookTimeoutMs(), notificationWebhookMaxAttempts());
  }
  const url = notificationWebhookUrl();
  const endpointHash = notificationWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(notificationWebhookSecret()),
    timeoutMs: notificationWebhookTimeoutMs(),
    maxAttempts: notificationWebhookMaxAttempts()
  };
}

function emailWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("email", emailWebhookTimeoutMs(), emailWebhookMaxAttempts());
  }
  const url = emailWebhookUrl();
  const endpointHash = emailWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(emailWebhookSecret()),
    timeoutMs: emailWebhookTimeoutMs(),
    maxAttempts: emailWebhookMaxAttempts()
  };
}

function auditWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("audit", auditWebhookTimeoutMs(), auditWebhookMaxAttempts());
  }
  const url = auditWebhookUrl();
  const endpointHash = auditWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(auditWebhookSecret()),
    timeoutMs: auditWebhookTimeoutMs(),
    maxAttempts: auditWebhookMaxAttempts()
  };
}

function backupWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("backup", backupWebhookTimeoutMs());
  }
  const url = backupWebhookUrl();
  const endpointHash = backupWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(backupWebhookSecret()),
    timeoutMs: backupWebhookTimeoutMs()
  };
}

function databaseSyncWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("database-sync", databaseSyncWebhookTimeoutMs());
  }
  const url = databaseSyncWebhookUrl();
  const endpointHash = databaseSyncWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(databaseSyncWebhookSecret()),
    timeoutMs: databaseSyncWebhookTimeoutMs()
  };
}

function alertWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("alert", alertWebhookTimeoutMs());
  }
  const url = alertWebhookUrl();
  const endpointHash = alertWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(alertWebhookSecret()),
    timeoutMs: alertWebhookTimeoutMs()
  };
}

function objectStorageWebhookProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("object-storage", objectStorageWebhookTimeoutMs());
  }
  const url = objectStorageWebhookUrl();
  const endpointHash = objectStorageWebhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(objectStorageWebhookSecret()),
    timeoutMs: objectStorageWebhookTimeoutMs()
  };
}

function collaborationPubSubProvider() {
  if (selfManagedLocalWebhookSinkEnabled()) {
    return localWebhookSinkProvider("collaboration-pubsub", collaborationPubSubTimeoutMs(), collaborationPubSubMaxAttempts());
  }
  const url = collaborationPubSubWebhookUrl();
  const endpointHash = collaborationPubSubEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(collaborationPubSubWebhookSecret()),
    timeoutMs: collaborationPubSubTimeoutMs(),
    maxAttempts: collaborationPubSubMaxAttempts()
  };
}

function opsTokenConfigured() {
  return Boolean(envValue("SENA_OPS_TOKEN"));
}

function alertingOwner() {
  return envValue("SENA_ALERTING_OWNER");
}

function alertingChannel() {
  return envValue("SENA_ALERTING_CHANNEL") ?? "deployment-monitor";
}

function alertingRunbookUrl() {
  const url = envValue("SENA_ALERTING_RUNBOOK_URL");
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_ALERTING_RUNBOOK_URL must be an HTTP(S) URL.", 500, "invalid_alerting_runbook_url");
  }
  return parsed.toString();
}

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireDbWriteLock(timeoutMs = dbLockTimeoutMs) {
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const startedAt = Date.now();
  const lockId = `${process.pid}:${Date.now()}:${randomBytes(4).toString("hex")}`;
  while (true) {
    try {
      writeFileSync(dbLockPath, lockId, { flag: "wx" });
      return lockId;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code !== "EEXIST") throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new SenaEnterpriseError("Timed out waiting for SENA enterprise database write lock.", 503, "enterprise_db_lock_timeout");
      }
      sleepSync(dbLockPollMs);
    }
  }
}

function releaseDbWriteLock(lockId: string) {
  try {
    if (!existsSync(dbLockPath)) return;
    const current = readFileSync(dbLockPath, "utf8");
    if (current === lockId) unlinkSync(dbLockPath);
  } catch {
    // Lock cleanup failure is reported on the next storage health probe.
  }
}

function storageLockProbe() {
  let lockId = "";
  try {
    lockId = acquireDbWriteLock(Math.min(250, dbLockTimeoutMs));
    return { lockProbe: "pass" as const, lockTimeoutMs: dbLockTimeoutMs };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    return {
      lockProbe: "fail" as const,
      lockTimeoutMs: dbLockTimeoutMs,
      lockErrorHash: createHash("sha256").update(message).digest("hex")
    };
  } finally {
    if (lockId) releaseDbWriteLock(lockId);
  }
}

function storageWriteProbe() {
  try {
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    const probePath = path.join(dbDir, `.ops-write-probe-${process.pid}-${Date.now()}.tmp`);
    writeFileSync(probePath, "ok");
    unlinkSync(probePath);
    return { writable: true, writeProbe: "pass" as const };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    return {
      writable: false,
      writeProbe: "fail" as const,
      writeErrorHash: createHash("sha256").update(message).digest("hex")
    };
  }
}

function dbFileStats() {
  const backupStat = existsSync(dbBackupPath) ? statSync(dbBackupPath) : null;
  if (!existsSync(dbPath)) {
    return {
      dbFileExists: false,
      dbBytes: 0,
      dbBackupExists: Boolean(backupStat),
      dbBackupBytes: backupStat?.size ?? 0,
      dbBackupUpdatedAt: backupStat?.mtime.toISOString()
    };
  }
  const stat = statSync(dbPath);
  return {
    dbFileExists: true,
    dbBytes: stat.size,
    dbUpdatedAt: stat.mtime.toISOString(),
    dbBackupExists: Boolean(backupStat),
    dbBackupBytes: backupStat?.size ?? 0,
    dbBackupUpdatedAt: backupStat?.mtime.toISOString()
  };
}

function latestAuditAt(db: SenaEnterpriseDb, event: SenaEnterpriseAuditEvent) {
  return db.auditLog
    .filter((entry) => entry.event === event)
    .map((entry) => entry.createdAt)
    .sort((a, b) => b.localeCompare(a))[0];
}

function backupAgeSeconds(lastBackupAt?: string) {
  if (!lastBackupAt) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(lastBackupAt)) / 1000));
}

function normalizedBaseUrl(baseUrl?: string) {
  const candidate = (baseUrl || envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
  try {
    return new URL(candidate).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL for OAuth/OIDC SSO.", 500, "invalid_sso_app_url");
  }
}

function ssoCallbackUrl(provider: SenaEnterpriseSsoProvider, baseUrl?: string) {
  const url = new URL(ssoCallbackPath, normalizedBaseUrl(baseUrl));
  url.searchParams.set("provider", provider);
  return url.toString();
}

function safeRedirectTo(redirectTo?: string) {
  const fallback = "/workspace/sena";
  const value = redirectTo?.trim();
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function safeInviteCode(inviteCode?: string) {
  const value = inviteCode?.trim();
  return value ? value.slice(0, 128) : undefined;
}

function requirePendingInvitationForEmail(db: SenaEnterpriseDb, inviteCode: string | undefined, email: string) {
  const safeCode = safeInviteCode(inviteCode);
  if (!safeCode) return undefined;
  const invitation = db.invitations.find((candidate) => candidate.inviteCode === safeCode);
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  if (invitation.status !== "pending") {
    throw new SenaEnterpriseError("Invitation is no longer pending.", 409, "invitation_not_pending");
  }
  if (invitation.email !== email) {
    throw new SenaEnterpriseError("Invitation email does not match the requested account.", 403, "invitation_email_mismatch");
  }
  return invitation;
}

function ssoStateExpiry() {
  return new Date(Date.now() + ssoStateMinutes * 60 * 1000).toISOString();
}

function profileString(profile: Record<string, unknown>, key: string) {
  const value = profile[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodeSsoJwtJsonSegment(provider: SenaEnterpriseSsoProvider, segment: string, code: string) {
  try {
    const decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("segment is not an object");
    return decoded as Record<string, unknown>;
  } catch {
    throw new SenaEnterpriseError(`${provider} id_token could not be parsed.`, 502, code);
  }
}

function decodeSsoJwt(provider: SenaEnterpriseSsoProvider, idToken: string) {
  const segments = idToken.split(".");
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    throw new SenaEnterpriseError(`${provider} id_token is not a signed JWT.`, 502, "sso_id_token_invalid");
  }
  return {
    header: decodeSsoJwtJsonSegment(provider, segments[0], "sso_id_token_header_invalid"),
    payload: decodeSsoJwtJsonSegment(provider, segments[1], "sso_id_token_invalid"),
    signingInput: `${segments[0]}.${segments[1]}`,
    signature: Buffer.from(segments[2], "base64url")
  };
}

function ssoIdTokenAudienceMatches(payload: Record<string, unknown>, clientId: string) {
  const audience = payload.aud;
  if (typeof audience === "string") return audience === clientId;
  if (Array.isArray(audience)) return audience.some((candidate) => candidate === clientId);
  return false;
}

const ssoJwtSignatureAlgorithms: Record<string, string> = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512",
  ES256: "SHA256",
  ES384: "SHA384",
  ES512: "SHA512"
};

function numericSsoClaim(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function loadSsoJwks(provider: SenaEnterpriseSsoProvider, jwksUrl: string | undefined) {
  if (!jwksUrl) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata is required for id_token validation.`, 500, "sso_id_token_metadata_missing");
  }
  const response = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata could not be loaded.`, 502, "sso_jwks_fetch_failed");
  }
  const body = await response.json() as Record<string, unknown>;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata did not include signing keys.`, 502, "sso_jwks_keys_missing");
  }
  return keys.filter((key): key is Record<string, unknown> => Boolean(key) && typeof key === "object" && !Array.isArray(key));
}

function matchingSsoJwk(jwks: Record<string, unknown>[], header: Record<string, unknown>) {
  const kid = profileString(header, "kid");
  const alg = profileString(header, "alg");
  return jwks.find((key) => {
    const keyUse = profileString(key, "use");
    const keyKid = profileString(key, "kid");
    const keyAlg = profileString(key, "alg");
    return (!kid || keyKid === kid) &&
      (!keyAlg || keyAlg === alg) &&
      (!keyUse || keyUse === "sig");
  });
}

async function verifySsoIdTokenSignature(input: {
  provider: SenaEnterpriseSsoProvider;
  jwksUrl?: string;
  header: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}) {
  const alg = profileString(input.header, "alg");
  const algorithm = alg ? ssoJwtSignatureAlgorithms[alg] : undefined;
  if (!algorithm) {
    throw new SenaEnterpriseError(`${input.provider} id_token signing algorithm is not supported.`, 502, "sso_id_token_alg_unsupported");
  }
  const jwks = await loadSsoJwks(input.provider, input.jwksUrl);
  const jwk = matchingSsoJwk(jwks, input.header);
  if (!jwk) {
    throw new SenaEnterpriseError(`${input.provider} JWKS did not include the id_token signing key.`, 502, "sso_jwks_key_not_found");
  }
  let valid = false;
  try {
    const keyObject = createPublicKey({ key: jwk as CryptoJsonWebKey, format: "jwk" });
    valid = verify(algorithm, Buffer.from(input.signingInput), keyObject, input.signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new SenaEnterpriseError(`${input.provider} id_token signature is invalid.`, 401, "sso_id_token_signature_invalid");
  }
}

async function validateSsoIdTokenBinding(input: {
  provider: SenaEnterpriseSsoProvider;
  idToken: string;
  expectedNonce: string;
  clientId: string;
  expectedIssuer?: string;
  jwksUrl?: string;
}) {
  const token = decodeSsoJwt(input.provider, input.idToken);
  await verifySsoIdTokenSignature({
    provider: input.provider,
    jwksUrl: input.jwksUrl,
    header: token.header,
    signingInput: token.signingInput,
    signature: token.signature
  });
  const payload = token.payload;
  const issuer = profileString(payload, "iss");
  if (!input.expectedIssuer || !issuer || issuer !== input.expectedIssuer) {
    throw new SenaEnterpriseError(`${input.provider} id_token issuer did not match the configured issuer.`, 401, "sso_issuer_mismatch");
  }
  const nonce = profileString(payload, "nonce");
  if (!nonce) throw new SenaEnterpriseError(`${input.provider} id_token did not include a nonce.`, 502, "sso_nonce_missing");
  if (nonce !== input.expectedNonce) {
    throw new SenaEnterpriseError(`${input.provider} id_token nonce did not match the SSO state.`, 401, "sso_nonce_mismatch");
  }
  if (!ssoIdTokenAudienceMatches(payload, input.clientId)) {
    throw new SenaEnterpriseError(`${input.provider} id_token audience did not match the SENA client.`, 401, "sso_audience_mismatch");
  }
  const issuedAt = numericSsoClaim(payload, "iat");
  if (!issuedAt) {
    throw new SenaEnterpriseError(`${input.provider} id_token did not include an issued-at timestamp.`, 502, "sso_id_token_iat_missing");
  }
  const expiresAt = numericSsoClaim(payload, "exp");
  if (!expiresAt) {
    throw new SenaEnterpriseError(`${input.provider} id_token did not include an expiry timestamp.`, 502, "sso_id_token_exp_missing");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt <= nowSeconds) {
    throw new SenaEnterpriseError(`${input.provider} id_token has expired.`, 401, "sso_id_token_expired");
  }
  if (issuedAt > nowSeconds + 300) {
    throw new SenaEnterpriseError(`${input.provider} id_token issued-at timestamp is in the future.`, 401, "sso_id_token_iat_invalid");
  }
}

function subjectEmailFallback(provider: SenaEnterpriseSsoProvider, subject: string) {
  const local = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "user";
  return `${provider}-${local}@sso.sena.local`;
}

function ssoProviderStatus(provider: SenaEnterpriseSsoProvider): SenaEnterpriseSsoProviderStatus {
  const prefix = providerEnvPrefix(provider);
  const clientIdKey = `${prefix}_CLIENT_ID`;
  const clientSecretKey = `${prefix}_CLIENT_SECRET`;
  const discoveryKey = `${prefix}_DISCOVERY_URL`;
  const issuerKey = `${prefix}_ISSUER`;
  const authorizationKey = `${prefix}_AUTHORIZATION_URL`;
  const tokenKey = `${prefix}_TOKEN_URL`;
  const userinfoKey = `${prefix}_USERINFO_URL`;
  const jwksKey = `${prefix}_JWKS_URL`;
  const clientId = envValue(clientIdKey);
  const clientSecret = envValue(clientSecretKey);
  const scopes = envValue(`${prefix}_SCOPES`) || "openid email profile";
  const clientSecretStrength = productionSecretStrength(clientSecret);
  const discoveryUrl = envValue(discoveryKey) || defaultSsoDiscoveryUrls[provider];
  const issuer = envValue(issuerKey);
  const authorizationUrl = envValue(authorizationKey);
  const tokenUrl = envValue(tokenKey);
  const userinfoUrl = envValue(userinfoKey);
  const jwksUrl = envValue(jwksKey);
  const endpointHostPolicy = ssoEndpointHostPolicy(provider, [
    discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  ]);
  const requiredEnv = [clientIdKey, clientSecretKey];
  const missingEnv = [
    clientId ? null : clientIdKey,
    clientSecret ? null : clientSecretKey,
    discoveryUrl || (authorizationUrl && tokenUrl && userinfoUrl) ? null : `${discoveryKey} or ${authorizationKey}+${tokenKey}+${userinfoKey}`
  ].filter(Boolean) as string[];

  return {
    provider,
    configured: missingEnv.length === 0,
    clientId,
    scopes,
    clientSecretStrength,
    endpointHostPolicy,
    mode: missingEnv.length === 0 ? "oauth-oidc" : "local-pilot-fallback",
    fallbackPolicy: enterpriseLocalSsoFallbackPolicy(),
    requiredEnv,
    missingEnv,
    discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  };
}

export function enterpriseLocalSsoFallbackPolicy() {
  const explicitOverride = envValue("SENA_ALLOW_LOCAL_SSO_FALLBACK") === "1";
  const productionRuntime = process.env.NODE_ENV === "production";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy,
    enabled: !productionRuntime || explicitOverride,
    productionRuntime,
    explicitOverride,
    env: "SENA_ALLOW_LOCAL_SSO_FALLBACK" as const
  };
}

export function requireEnterpriseLocalSsoFallbackAllowed(provider: SenaEnterpriseSsoProvider) {
  const policy = enterpriseLocalSsoFallbackPolicy();
  if (!policy.enabled) {
    throw new SenaEnterpriseError(
      `Local pilot SSO fallback is disabled for ${provider} in production. Configure OAuth/OIDC provider credentials or set SENA_ALLOW_LOCAL_SSO_FALLBACK=1 only for an approved pilot-only deployment.`,
      503,
      "sso_local_fallback_disabled"
    );
  }
  return policy;
}

export function getEnterpriseSsoProviderStatuses(): SenaEnterpriseSsoProviderStatus[] {
  return ssoProviders.map((provider) => ssoProviderStatus(provider));
}

export function isEnterpriseSsoProviderConfigured(provider: SenaEnterpriseSsoProvider) {
  return ssoProviderStatus(provider).configured;
}

function sha256Text(value: string | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : undefined;
}

function httpUrlCheck(id: string, label: string, url: string | undefined): SenaEnterpriseGovernanceCheck {
  let pass = false;
  if (url) {
    try {
      const parsed = new URL(url);
      pass = parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      pass = false;
    }
  }
  return {
    id,
    label,
    status: pass ? "pass" : "review",
    evidence: [
      `configured=${url ? "true" : "false"}`,
      `urlHash=${sha256Text(url) ?? "none"}`
    ],
    nextAction: pass ? "Keep this OAuth/OIDC endpoint pinned in the IdP configuration." : "Configure this OAuth/OIDC endpoint as an absolute HTTP(S) URL."
  };
}

function latestSsoPreflightByProvider(db: SenaEnterpriseDb) {
  const latest = new Map<SenaEnterpriseSsoProvider, SenaEnterpriseAuditLogEntry>();
  for (const entry of db.auditLog
    .filter((candidate) => candidate.event === "auth.sso.preflight.pass" || candidate.event === "auth.sso.preflight.fail")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const provider = entry.detail.provider;
    if ((provider === "institution" || provider === "google" || provider === "orcid") && !latest.has(provider)) {
      latest.set(provider, entry);
    }
  }
  return latest;
}

const ssoPreflightFreshnessPolicy = {
  maxAgeDays: 30
};

function ssoPreflightAgeDays(entry: SenaEnterpriseAuditLogEntry) {
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs) || createdAtMs > Date.now()) return null;
  return Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000));
}

function auditDetailString(entry: SenaEnterpriseAuditLogEntry, key: string) {
  const value = entry.detail[key];
  return typeof value === "string" ? value : undefined;
}

function ssoPreflightCurrentConfigHashes(provider: SenaEnterpriseSsoProviderStatus) {
  return {
    clientIdHash: sha256Text(provider.clientId),
    scopesHash: sha256Text(provider.scopes),
    endpointDiscoveryHash: sha256Text(provider.discoveryUrl),
    issuerHash: sha256Text(provider.issuer),
    endpointAuthorizationHash: sha256Text(provider.authorizationUrl),
    endpointTokenHash: sha256Text(provider.tokenUrl),
    endpointUserinfoHash: sha256Text(provider.userinfoUrl),
    endpointJwksHash: sha256Text(provider.jwksUrl),
    callbackHash: sha256Text(ssoCallbackUrl(provider.provider))
  };
}

function identitySecretVersionBinding(envName: string) {
  const value = envValue(envName)?.trim();
  return {
    env: envName,
    configured: Boolean(value),
    ...(value ? { versionHash: sha256Text(value) } : {})
  };
}

function secretVersionBindingChanged(
  accepted: { configured?: boolean; versionHash?: string } | undefined,
  current: { configured?: boolean; versionHash?: string } | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.versionHash);
  const currentConfigured = Boolean(current?.configured || current?.versionHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.versionHash !== current?.versionHash;
}

function secretStoreReferenceBinding(
  envName: NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]>["env"]
): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]> {
  const value = envValue(envName)?.trim();
  return {
    env: envName,
    configured: Boolean(value),
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(value ? { referenceHash: sha256Text(value) } : {})
  };
}

function secretStoreReferenceReady(
  binding: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]
) {
  return process.env.NODE_ENV !== "production" || Boolean(binding?.configured);
}

function secretStoreReferenceChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"] | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.referenceHash);
  const currentConfigured = Boolean(current?.configured || current?.referenceHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.referenceHash !== current?.referenceHash;
}

const identitySecretRotationCadenceMinDays = 1;
const identitySecretRotationCadenceMaxDays = 180;
const identitySecretRotationCadenceDefaultDays = 180;
const identitySecretRotationCadenceDefaultWarningDays = 30;

function identitySecretRotationCadenceBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"]> {
  const env = "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS" as const;
  const rawValue = envValue(env)?.trim();
  const cadenceDays = rawValue && /^\d+$/.test(rawValue) ? Number.parseInt(rawValue, 10) : undefined;
  const valid = cadenceDays !== undefined &&
    cadenceDays >= identitySecretRotationCadenceMinDays &&
    cadenceDays <= identitySecretRotationCadenceMaxDays;
  return {
    env,
    configured: Boolean(rawValue),
    valid,
    requiredInProduction: process.env.NODE_ENV === "production",
    minDays: identitySecretRotationCadenceMinDays,
    maxDays: identitySecretRotationCadenceMaxDays,
    ...(valid && cadenceDays !== undefined ? {
      cadenceDays,
      cadenceHash: sha256Text(String(cadenceDays))
    } : {})
  };
}

function identitySecretRotationCadenceReady(
  binding = identitySecretRotationCadenceBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.valid;
}

function identitySecretRotationCadenceChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"] | undefined
) {
  if (process.env.NODE_ENV === "production" && (!accepted?.valid || !current?.valid)) return true;
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.cadenceHash);
  const currentConfigured = Boolean(current?.configured || current?.cadenceHash);
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.cadenceDays !== current?.cadenceDays || accepted?.cadenceHash !== current?.cadenceHash;
}

function identitySecretRotationMaxAgeDays() {
  const cadence = identitySecretRotationCadenceBinding();
  return cadence.valid && cadence.cadenceDays ? cadence.cadenceDays : identitySecretRotationCadenceDefaultDays;
}

function identitySecretRotationWarningDays(maxAgeDays = identitySecretRotationMaxAgeDays()) {
  return Math.min(identitySecretRotationCadenceDefaultWarningDays, maxAgeDays);
}

function idpTenantBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"]> {
  const env = "SENA_SSO_INSTITUTION_TENANT_ID" as const;
  const value = envValue(env)?.trim();
  return {
    env,
    configured: Boolean(value),
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(value ? { tenantHash: sha256Text(value) } : {})
  };
}

function idpTenantBindingReady(
  binding = idpTenantBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.configured;
}

function idpTenantBindingChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"] | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.tenantHash);
  const currentConfigured = Boolean(current?.configured || current?.tenantHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.tenantHash !== current?.tenantHash;
}

const identityLifecycleOwnerModes = ["scim", "idp", "hybrid"] as const;

function identityLifecycleOwnerModeBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"]> {
  const env = "SENA_IDENTITY_LIFECYCLE_OWNER_MODE" as const;
  const rawMode = envValue(env)?.trim().toLowerCase();
  const valid = Boolean(rawMode && identityLifecycleOwnerModes.includes(rawMode as typeof identityLifecycleOwnerModes[number]));
  return {
    env,
    configured: Boolean(rawMode),
    valid,
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(valid ? {
      mode: rawMode as typeof identityLifecycleOwnerModes[number],
      modeHash: sha256Text(rawMode)
    } : {}),
    acceptedModes: [...identityLifecycleOwnerModes]
  };
}

function identityLifecycleOwnerModeReady(
  binding = identityLifecycleOwnerModeBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.valid;
}

function lifecycleOwnerModeBindingChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"] | undefined
) {
  if (process.env.NODE_ENV === "production" && (!accepted?.valid || !current?.valid)) return true;
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.modeHash);
  const currentConfigured = Boolean(current?.configured || current?.modeHash);
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.mode !== current?.mode || accepted?.modeHash !== current?.modeHash;
}

function ssoClientSecretVersionEnv(provider: SenaEnterpriseSsoProvider) {
  return `${providerEnvPrefix(provider)}_CLIENT_SECRET_VERSION`;
}

function ssoSecretReadinessBinding(provider: SenaEnterpriseSsoProviderStatus) {
  const versionBinding = identitySecretVersionBinding(ssoClientSecretVersionEnv(provider.provider));
  return {
    clientSecretStrength: provider.clientSecretStrength,
    clientSecretMinLength: "32",
    clientSecretVersionConfigured: versionBinding.configured,
    clientSecretVersionHash: versionBinding.versionHash,
    clientSecretVersionEnv: versionBinding.env
  };
}

function ssoPreflightCurrentConfigBindingValues(provider: SenaEnterpriseSsoProviderStatus) {
  const secretBinding = ssoSecretReadinessBinding(provider);
  return {
    ...ssoPreflightCurrentConfigHashes(provider),
    clientSecretStrength: secretBinding.clientSecretStrength,
    clientSecretMinLength: secretBinding.clientSecretMinLength
  };
}

function configHashBindingChanged(
  previousHashes: Record<string, string | undefined>,
  currentHashes: Record<string, string | undefined>
) {
  const keys = new Set([...Object.keys(previousHashes), ...Object.keys(currentHashes)]);
  for (const key of keys) {
    if (previousHashes[key] !== currentHashes[key]) return true;
  }
  return false;
}

function ssoPreflightConfigBinding(entry: SenaEnterpriseAuditLogEntry | undefined, provider: SenaEnterpriseSsoProviderStatus | undefined) {
  if (!entry || !provider) return "missing";
  if (!provider.configured) return "missing-config";
  const current = ssoPreflightCurrentConfigBindingValues(provider);
  const previous = Object.fromEntries(Object.keys(current).map((key) => [key, auditDetailString(entry, key)]));
  return configHashBindingChanged(previous, current) ? "changed" : "current";
}

function buildEnterpriseIdentityTechnicalEvidenceBinding(
  decisionId: string,
  db: SenaEnterpriseDb = readEnterpriseDb()
): SenaEnterpriseIdentityTechnicalEvidenceBinding | undefined {
  if (decisionId === "institution-provisioning-owner") {
    const provisioningToken = provisioningTokenProductionEvidence();
    const secretVersionBinding = identitySecretVersionBinding("SENA_PROVISIONING_TOKEN_VERSION");
    const secretStoreBinding = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
    const secretRotationCadenceBinding = identitySecretRotationCadenceBinding();
    const lifecycleOwnerModeBinding = identityLifecycleOwnerModeBinding();
    const lifecycleOwnerModeReady = identityLifecycleOwnerModeReady(lifecycleOwnerModeBinding);
    const status: SenaEnterpriseIdentityTechnicalEvidenceBinding["status"] =
      provisioningToken.ready &&
      secretStoreReferenceReady(secretStoreBinding) &&
      lifecycleOwnerModeReady &&
      identitySecretRotationCadenceReady(secretRotationCadenceBinding)
        ? "ready"
        : "review";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding,
      decisionId,
      status,
      configBinding: "current",
      secretVersionBinding,
      secretStoreReferenceBinding: secretStoreBinding,
      secretRotationCadenceBinding,
      lifecycleOwnerModeBinding,
      evidence: [
        "schema=sena-enterprise-identity-technical-evidence-binding/v1",
        "technicalPrerequisite=provisioning-token",
        `status=${status}`,
        `rotationCadenceDays=${secretRotationCadenceBinding.cadenceDays ?? "missing"}`,
        `rotationCadenceValid=${secretRotationCadenceBinding.valid}`,
        `rotationCadenceRequiredInProduction=${secretRotationCadenceBinding.requiredInProduction}`,
        `rotationCadenceHash=${secretRotationCadenceBinding.cadenceHash ? "present" : "missing"}`,
        `rotationCadenceEnv=${secretRotationCadenceBinding.env}`,
        `secretStoreReference=${secretStoreBinding.referenceHash ? "present" : "missing"}`,
        `secretStoreReferenceRequiredInProduction=${secretStoreBinding.requiredInProduction}`,
        `secretStoreReferenceEnv=${secretStoreBinding.env}`,
        `lifecycleOwnerMode=${lifecycleOwnerModeBinding.mode ?? "missing"}`,
        `lifecycleOwnerModeValid=${lifecycleOwnerModeBinding.valid}`,
        `lifecycleOwnerModeRequiredInProduction=${lifecycleOwnerModeBinding.requiredInProduction}`,
        `lifecycleOwnerModeHash=${lifecycleOwnerModeBinding.modeHash ? "present" : "missing"}`,
        `lifecycleOwnerModeEnv=${lifecycleOwnerModeBinding.env}`,
        `provisioningTokenVersionHash=${secretVersionBinding.versionHash ? "present" : "missing"}`,
        `provisioningTokenVersionEnv=${secretVersionBinding.env}`,
        ...provisioningToken.evidence,
        "secretHashing=disabled"
      ]
    };
  }
  if (decisionId !== "institution-idp-approval") return undefined;
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return undefined;
  const entry = latestSsoPreflightByProvider(db).get("institution");
  const latestPreflightStatus = ssoPreflightStatus(entry, provider);
  const configBinding = ssoPreflightConfigBinding(entry, provider);
  const secretBinding = ssoSecretReadinessBinding(provider);
  const secretStoreBinding = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
  const tenantBinding = idpTenantBinding();
  const secretRotationCadenceBinding = identitySecretRotationCadenceBinding();
  const configHashes = Object.fromEntries(
    Object.entries(ssoPreflightCurrentConfigHashes(provider)).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ) as SenaEnterpriseIdentityTechnicalEvidenceBinding["configHashes"];
  const status: SenaEnterpriseIdentityTechnicalEvidenceBinding["status"] =
    provider.configured &&
    latestPreflightStatus === "pass" &&
    secretStoreReferenceReady(secretStoreBinding) &&
    idpTenantBindingReady(tenantBinding) &&
    identitySecretRotationCadenceReady(secretRotationCadenceBinding)
      ? "ready"
      : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding,
    decisionId,
    provider: "institution",
    status,
    secretBinding: {
      clientSecretStrength: secretBinding.clientSecretStrength,
      clientSecretMinLength: 32,
      clientSecretVersionConfigured: secretBinding.clientSecretVersionConfigured,
      ...(secretBinding.clientSecretVersionHash ? { clientSecretVersionHash: secretBinding.clientSecretVersionHash } : {}),
      clientSecretVersionEnv: secretBinding.clientSecretVersionEnv
    },
    secretStoreReferenceBinding: secretStoreBinding,
    secretRotationCadenceBinding,
    idpTenantBinding: tenantBinding,
    ...(entry?.createdAt ? { latestPreflightAt: entry.createdAt } : {}),
    latestPreflightStatus,
    configBinding,
    configHashes,
    evidence: [
      "schema=sena-enterprise-identity-technical-evidence-binding/v1",
      "provider=institution",
      `status=${status}`,
      `preflight=${latestPreflightStatus}`,
      `configBinding=${configBinding}`,
      `hashes=${Object.keys(configHashes ?? {}).sort().join("|") || "none"}`,
      `clientSecretStrength=${secretBinding.clientSecretStrength}`,
      `clientSecretMinLength=${secretBinding.clientSecretMinLength}`,
      `clientSecretVersionHash=${secretBinding.clientSecretVersionHash ? "present" : "missing"}`,
      `clientSecretVersionEnv=${secretBinding.clientSecretVersionEnv}`,
      `secretStoreReference=${secretStoreBinding.referenceHash ? "present" : "missing"}`,
      `secretStoreReferenceRequiredInProduction=${secretStoreBinding.requiredInProduction}`,
      `secretStoreReferenceEnv=${secretStoreBinding.env}`,
      `rotationCadenceDays=${secretRotationCadenceBinding.cadenceDays ?? "missing"}`,
      `rotationCadenceValid=${secretRotationCadenceBinding.valid}`,
      `rotationCadenceRequiredInProduction=${secretRotationCadenceBinding.requiredInProduction}`,
      `rotationCadenceHash=${secretRotationCadenceBinding.cadenceHash ? "present" : "missing"}`,
      `rotationCadenceEnv=${secretRotationCadenceBinding.env}`,
      `tenantBinding=${tenantBinding.configured ? "configured" : "missing"}`,
      `tenantBindingRequiredInProduction=${tenantBinding.requiredInProduction}`,
      `tenantHash=${tenantBinding.tenantHash ? "present" : "missing"}`,
      `tenantEnv=${tenantBinding.env}`,
      "secretHashing=disabled"
    ]
  };
}

function identityTechnicalEvidenceBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
): "current" | "stale" | "not-required" {
  const binding = acceptance.technicalEvidenceBinding;
  if (acceptance.decisionId === "institution-provisioning-owner") {
    if (!binding) return "stale";
    if (
      binding.schemaVersion !== "sena-enterprise-identity-technical-evidence-binding/v1" ||
      binding.decisionId !== "institution-provisioning-owner"
    ) {
      return "stale";
    }
    const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-provisioning-owner");
    if (!current || binding.status !== current.status) return "stale";
    if (secretVersionBindingChanged(binding.secretVersionBinding, current.secretVersionBinding)) return "stale";
    if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, current.secretStoreReferenceBinding)) return "stale";
    if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, current.secretRotationCadenceBinding)) return "stale";
    if (lifecycleOwnerModeBindingChanged(binding.lifecycleOwnerModeBinding, current.lifecycleOwnerModeBinding)) return "stale";
    const comparableEvidence = (entries: string[]) => entries.filter((entry) => (
      !entry.startsWith("provisioningTokenVersionHash=") &&
      !entry.startsWith("provisioningTokenVersionEnv=") &&
      !entry.startsWith("secretStoreReference=") &&
      !entry.startsWith("secretStoreReferenceRequiredInProduction=") &&
      !entry.startsWith("secretStoreReferenceEnv=") &&
      !entry.startsWith("rotationCadenceDays=") &&
      !entry.startsWith("rotationCadenceValid=") &&
      !entry.startsWith("rotationCadenceRequiredInProduction=") &&
      !entry.startsWith("rotationCadenceHash=") &&
      !entry.startsWith("rotationCadenceEnv=") &&
      !entry.startsWith("lifecycleOwnerMode=") &&
      !entry.startsWith("lifecycleOwnerModeValid=") &&
      !entry.startsWith("lifecycleOwnerModeRequiredInProduction=") &&
      !entry.startsWith("lifecycleOwnerModeHash=") &&
      !entry.startsWith("lifecycleOwnerModeEnv=")
    ));
    const acceptedEvidence = new Set(comparableEvidence(binding.evidence));
    const currentEvidence = new Set(comparableEvidence(current.evidence));
    if (acceptedEvidence.size !== currentEvidence.size) return "stale";
    for (const entry of currentEvidence) {
      if (!acceptedEvidence.has(entry)) return "stale";
    }
    return "current";
  }
  if (acceptance.decisionId !== "institution-idp-approval") return "not-required";
  if (!binding || binding.schemaVersion !== "sena-enterprise-identity-technical-evidence-binding/v1" || binding.provider !== "institution") {
    return "stale";
  }
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return "stale";
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-idp-approval");
  if (
    !current ||
    binding.status !== current.status ||
    binding.latestPreflightStatus !== current.latestPreflightStatus ||
    binding.configBinding !== current.configBinding
  ) {
    return "stale";
  }
  const currentSecretBinding = ssoSecretReadinessBinding(provider);
  if (!binding.secretBinding || (
    binding.secretBinding.clientSecretStrength !== currentSecretBinding.clientSecretStrength ||
    String(binding.secretBinding.clientSecretMinLength) !== currentSecretBinding.clientSecretMinLength
  )) {
    return "stale";
  }
  if (secretVersionBindingChanged({
    configured: binding.secretBinding.clientSecretVersionConfigured,
    versionHash: binding.secretBinding.clientSecretVersionHash
  }, {
    configured: currentSecretBinding.clientSecretVersionConfigured,
    versionHash: currentSecretBinding.clientSecretVersionHash
  })) {
    return "stale";
  }
  if (idpTenantBindingChanged(binding.idpTenantBinding, current.idpTenantBinding)) return "stale";
  if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, current.secretStoreReferenceBinding)) return "stale";
  if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, current.secretRotationCadenceBinding)) return "stale";
  const currentHashes = current.configHashes ?? ssoPreflightCurrentConfigHashes(provider);
  const acceptedHashes = binding.configHashes ?? {};
  return configHashBindingChanged(acceptedHashes, currentHashes) ? "stale" : "current";
}

function identityPlatformEvidenceBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
): "current" | "stale" | "not-required" {
  if (acceptance.decisionId !== "institution-idp-approval") {
    return identityTechnicalEvidenceBindingStatus(acceptance);
  }
  const binding = acceptance.technicalEvidenceBinding;
  if (!binding || binding.schemaVersion !== "sena-enterprise-identity-technical-evidence-binding/v1" || binding.provider !== "institution") {
    return "stale";
  }
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return "stale";
  const currentSecretBinding = ssoSecretReadinessBinding(provider);
  if (!binding.secretBinding || (
    binding.secretBinding.clientSecretStrength !== currentSecretBinding.clientSecretStrength ||
    String(binding.secretBinding.clientSecretMinLength) !== currentSecretBinding.clientSecretMinLength
  )) {
    return "stale";
  }
  if (secretVersionBindingChanged({
    configured: binding.secretBinding.clientSecretVersionConfigured,
    versionHash: binding.secretBinding.clientSecretVersionHash
  }, {
    configured: currentSecretBinding.clientSecretVersionConfigured,
    versionHash: currentSecretBinding.clientSecretVersionHash
  })) {
    return "stale";
  }
  if (idpTenantBindingChanged(binding.idpTenantBinding, idpTenantBinding())) return "stale";
  if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"))) return "stale";
  if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, identitySecretRotationCadenceBinding())) return "stale";
  const currentHashes = ssoPreflightCurrentConfigHashes(provider);
  const acceptedHashes = binding.configHashes ?? {};
  return configHashBindingChanged(acceptedHashes, currentHashes) ? "stale" : "current";
}

function identityTechnicalReadinessStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
): "ready" | "review" | "not-required" {
  if (!isIdentityProductionDecisionId(acceptance.decisionId)) return "not-required";
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding(acceptance.decisionId);
  if (!current) return "review";
  return current.status === "ready" ? "ready" : "review";
}

function identityTechnicalEvidenceBindingEvidence(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
) {
  const status = identityTechnicalEvidenceBindingStatus(acceptance);
  if (status === "not-required") return ["technicalBinding=not-required"];
  const binding = acceptance.technicalEvidenceBinding;
  if (acceptance.decisionId === "institution-provisioning-owner") {
    const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-provisioning-owner");
    return [
      `technicalBinding=${status}`,
      `bindingSchema=${binding?.schemaVersion ?? "missing"}`,
      `acceptedProvisioningStatus=${binding?.status ?? "missing"}`,
      `currentProvisioningStatus=${current?.status ?? "missing"}`,
      `acceptedLifecycleOwnerMode=${binding?.lifecycleOwnerModeBinding?.mode ?? "missing"}`,
      `currentLifecycleOwnerMode=${current?.lifecycleOwnerModeBinding?.mode ?? "missing"}`,
      `acceptedProvisioningTokenVersionHash=${binding?.secretVersionBinding?.versionHash ? "present" : "missing"}`,
      `currentProvisioningTokenVersionHash=${current?.secretVersionBinding?.versionHash ? "present" : "missing"}`,
      `acceptedSecretStoreReference=${binding?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
      `currentSecretStoreReference=${current?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
      `secretStoreReferenceEnv=${current?.secretStoreReferenceBinding?.env ?? "SENA_PROVISIONING_TOKEN_SECRET_REF"}`,
      `acceptedRotationCadence=${binding?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
      `currentRotationCadence=${current?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
      `rotationCadenceEnv=${current?.secretRotationCadenceBinding?.env ?? "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"}`,
      `acceptedProvisioningEvidence=${binding?.evidence.join("|") || "missing"}`,
      `currentProvisioningEvidence=${current?.evidence.join("|") || "missing"}`
    ];
  }
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-idp-approval");
  return [
    `technicalBinding=${status}`,
    `bindingSchema=${binding?.schemaVersion ?? "missing"}`,
    `provider=${binding?.provider ?? "missing"}`,
    `acceptedTechnicalStatus=${binding?.status ?? "missing"}`,
    `currentTechnicalStatus=${current?.status ?? "missing"}`,
    `acceptedPreflight=${binding?.latestPreflightStatus ?? "missing"}`,
    `currentPreflight=${current?.latestPreflightStatus ?? "missing"}`,
    `acceptedConfigBinding=${binding?.configBinding ?? "missing"}`,
    `currentConfigBinding=${current?.configBinding ?? "missing"}`,
    `acceptedHashKeys=${Object.keys(binding?.configHashes ?? {}).sort().join("|") || "missing"}`,
    `acceptedClientSecretStrength=${binding?.secretBinding?.clientSecretStrength ?? "missing"}`,
    `currentClientSecretStrength=${current?.secretBinding?.clientSecretStrength ?? ssoProviderStatus("institution").clientSecretStrength}`,
    `acceptedClientSecretVersionHash=${binding?.secretBinding?.clientSecretVersionHash ? "present" : "missing"}`,
    `currentClientSecretVersionHash=${current?.secretBinding?.clientSecretVersionHash ? "present" : "missing"}`,
    `acceptedSecretStoreReference=${binding?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
    `currentSecretStoreReference=${current?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
    `secretStoreReferenceEnv=${current?.secretStoreReferenceBinding?.env ?? "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"}`,
    `acceptedTenantBinding=${binding?.idpTenantBinding?.tenantHash ? "present" : "missing"}`,
    `currentTenantBinding=${current?.idpTenantBinding?.tenantHash ? "present" : "missing"}`,
    `tenantBindingEnv=${current?.idpTenantBinding?.env ?? "SENA_SSO_INSTITUTION_TENANT_ID"}`,
    `acceptedRotationCadence=${binding?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
    `currentRotationCadence=${current?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
    `rotationCadenceEnv=${current?.secretRotationCadenceBinding?.env ?? "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"}`
  ];
}

function ssoPreflightStatus(entry: SenaEnterpriseAuditLogEntry | undefined, provider?: SenaEnterpriseSsoProviderStatus) {
  if (!entry) return "missing";
  if (entry.event !== "auth.sso.preflight.pass") return "fail";
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs)) return "invalid";
  if (createdAtMs > Date.now()) return "future";
  const maxAgeMs = ssoPreflightFreshnessPolicy.maxAgeDays * 24 * 60 * 60 * 1000;
  if (Date.now() - createdAtMs > maxAgeMs) return "stale";
  const configBinding = ssoPreflightConfigBinding(entry, provider);
  if (configBinding === "changed") return "stale-config";
  if (configBinding === "missing-config") return "missing-config";
  return "pass";
}

function ssoPreflightEntryFresh(entry: SenaEnterpriseAuditLogEntry | undefined, provider?: SenaEnterpriseSsoProviderStatus) {
  return ssoPreflightStatus(entry, provider) === "pass";
}

function ssoPreflightEvidence(db: SenaEnterpriseDb, providers = getEnterpriseSsoProviderStatuses()) {
  const latest = latestSsoPreflightByProvider(db);
  return providers.map((provider) => {
    const entry = latest.get(provider.provider);
    const ageDays = entry ? ssoPreflightAgeDays(entry) : null;
    return `${provider.provider}:configured=${provider.configured};preflight=${ssoPreflightStatus(entry, provider)};at=${entry?.createdAt ?? "missing"};maxAgeDays=${ssoPreflightFreshnessPolicy.maxAgeDays};ageDays=${ageDays ?? "missing"};configBinding=${ssoPreflightConfigBinding(entry, provider)}`;
  });
}

function ssoPreflightPassedProviders(db: SenaEnterpriseDb, providers = getEnterpriseSsoProviderStatuses()) {
  const latest = latestSsoPreflightByProvider(db);
  return providers.filter((provider) => ssoPreflightEntryFresh(latest.get(provider.provider), provider));
}

export async function preflightEnterpriseSsoProviders(input: {
  providers?: SenaEnterpriseSsoProvider[];
  baseUrl?: string;
} = {}): Promise<SenaEnterpriseSsoProviderPreflightResult> {
  const selectedProviders = input.providers?.length ? Array.from(new Set(input.providers)) : ssoProviders;
  const generatedAt = now();
  const baseUrl = normalizedBaseUrl(input.baseUrl);
  const db = readEnterpriseDb();
  const providers: SenaEnterpriseSsoProviderPreflight[] = [];

  for (const provider of selectedProviders) {
    const status = ssoProviderStatus(provider);
    const endpointHostPolicyPass = status.endpointHostPolicy === "production" || status.endpointHostPolicy === "not-required";
    const providerConfigPass = status.configured && status.clientSecretStrength === "configured" && endpointHostPolicyPass;
    const checks: SenaEnterpriseGovernanceCheck[] = [{
      id: "sso-provider-config",
      label: "OAuth/OIDC provider environment",
      status: providerConfigPass ? "pass" : "review",
      evidence: [
        `provider=${provider}`,
        `mode=${status.mode}`,
        `missing=${status.missingEnv.join("|") || "none"}`,
        `clientSecretStrength=${status.clientSecretStrength}`,
        `endpointHostPolicy=${status.endpointHostPolicy}`,
        "clientSecretMinLength=32"
      ],
      nextAction: providerConfigPass
        ? "Keep client credentials in the deployment secret store."
        : !endpointHostPolicyPass
          ? "Configure institution IdP endpoints with institution-owned HTTPS hosts, not local, SENA-owned, reserved, or example/test domains."
          : status.configured
            ? "Rotate the OAuth/OIDC client secret to a production secret-store value."
            : "Configure client ID, client secret, and discovery or explicit OAuth/OIDC endpoints."
    }];
    if (provider === "institution") {
      checks.push({
        id: "sso-production-endpoint-hosts",
        label: "Institution IdP production endpoint hosts",
        status: endpointHostPolicyPass ? "pass" : "review",
        evidence: [
          `provider=${provider}`,
          `endpointHostPolicy=${status.endpointHostPolicy}`,
          "requiredProtocol=https",
          "forbiddenHostKinds=local-or-private|sena-application-origin|reserved-example-or-test"
        ],
        nextAction: endpointHostPolicyPass
          ? "Keep institution IdP endpoints pinned to institution-owned HTTPS hosts."
          : "Move institution IdP issuer, authorization, token, userinfo, and JWKS endpoints to institution-owned HTTPS hosts before production release."
      });
    }
    let config: SenaEnterpriseResolvedSsoProvider | undefined;
    let errorCode: string | undefined;
    let errorHash: string | undefined;

    if (status.configured) {
      try {
        config = await resolveSsoProvider(provider, baseUrl);
        checks.push(httpUrlCheck("sso-authorization-url", "Authorization endpoint", config.authorizationUrl));
        checks.push(httpUrlCheck("sso-token-url", "Token endpoint", config.tokenUrl));
        checks.push(httpUrlCheck("sso-userinfo-url", "Userinfo endpoint", config.userinfoUrl));
        checks.push(httpUrlCheck("sso-jwks-url", "JWKS endpoint", config.jwksUrl));
        const callbackUrl = new URL(config.callbackUrl);
        checks.push({
          id: "sso-callback-url",
          label: "Callback URL",
          status: callbackUrl.searchParams.get("provider") === provider && callbackUrl.pathname === ssoCallbackPath ? "pass" : "review",
          evidence: [
            `callbackHash=${sha256Text(config.callbackUrl)}`,
            `providerParam=${callbackUrl.searchParams.get("provider") ?? "missing"}`,
            `path=${callbackUrl.pathname}`,
            `origin=${callbackUrl.origin}`
          ],
          nextAction: callbackUrl.searchParams.get("provider") === provider && callbackUrl.pathname === ssoCallbackPath
            ? "Register this callback URL with the IdP tenant."
            : "Fix SENA_APP_URL or callback routing before enabling this SSO provider."
        });
        const scopes = config.scopes.split(/\s+/).filter(Boolean);
        checks.push({
          id: "sso-scopes",
          label: "OIDC scopes",
          status: scopes.includes("openid") && scopes.includes("email") ? "pass" : "review",
          evidence: [`scopes=${scopes.join("|") || "none"}`],
          nextAction: scopes.includes("openid") && scopes.includes("email")
            ? "Keep openid/email/profile scopes aligned with the IdP consent screen."
            : "Include at least openid and email scopes for SENA SSO."
        });
        checks.push({
          id: "sso-pkce-nonce-binding",
          label: "PKCE and nonce binding",
          status: "pass",
          evidence: [
            "flow=authorization-code",
            "pkce=S256",
            "state=hashed-server-side",
            "nonce=state-bound",
            "idTokenNonce=validated-when-present",
            "audience=client-id"
          ],
          nextAction: "Keep PKCE S256, server-side state storage, and id_token nonce/audience validation enabled for this IdP."
        });
        const issuerUrl = config.issuer ? new URL(config.issuer) : undefined;
        const jwksUrl = config.jwksUrl ? new URL(config.jwksUrl) : undefined;
        const idTokenValidationPass = Boolean(
          issuerUrl &&
          jwksUrl &&
          (issuerUrl.protocol === "https:" || issuerUrl.protocol === "http:") &&
          (jwksUrl.protocol === "https:" || jwksUrl.protocol === "http:")
        );
        checks.push({
          id: "sso-id-token-validation",
          label: "OIDC id_token validation",
          status: idTokenValidationPass ? "pass" : "review",
          evidence: [
            `issuerHash=${sha256Text(config.issuer) ?? "missing"}`,
            `jwksHash=${sha256Text(config.jwksUrl) ?? "missing"}`,
            "signature=jwks",
            "claims=issuer|audience|nonce|exp|iat"
          ],
          nextAction: idTokenValidationPass
            ? "Keep issuer and JWKS metadata pinned through discovery or SENA_SSO_*_ISSUER/JWKS_URL."
            : "Configure issuer and JWKS metadata so SENA can verify OIDC id_token signatures and claims."
        });
      } catch (error) {
        const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
        errorCode = error instanceof SenaEnterpriseError ? error.code : "sso_preflight_failed";
        errorHash = createHash("sha256").update(message).digest("hex");
        checks.push({
          id: "sso-provider-resolution",
          label: "Provider metadata resolution",
          status: "review",
          evidence: [
            `errorCode=${errorCode}`,
            `errorHash=${errorHash}`
          ],
          nextAction: "Fix IdP discovery metadata or explicit endpoint configuration, then rerun SSO preflight."
        });
      }
    }

    const providerResult: SenaEnterpriseSsoProviderPreflight = {
      provider,
      status: checks.every((check) => check.status === "pass") ? "pass" : "review",
      mode: status.mode,
      configured: status.configured,
      generatedAt,
      callbackUrl: config?.callbackUrl,
      endpointHashes: {
        discovery: sha256Text(config?.discoveryUrl ?? status.discoveryUrl),
        issuer: sha256Text(config?.issuer ?? status.issuer),
        authorization: sha256Text(config?.authorizationUrl ?? status.authorizationUrl),
        token: sha256Text(config?.tokenUrl ?? status.tokenUrl),
        userinfo: sha256Text(config?.userinfoUrl ?? status.userinfoUrl),
        jwks: sha256Text(config?.jwksUrl ?? status.jwksUrl),
        callback: sha256Text(config?.callbackUrl)
      },
      checks,
      errorCode,
      errorHash
    };
    appendAudit(db, {
      event: providerResult.status === "pass" ? "auth.sso.preflight.pass" : "auth.sso.preflight.fail",
      detail: {
        provider,
        mode: providerResult.mode,
        configured: providerResult.configured,
        clientIdHash: sha256Text(config?.clientId ?? status.clientId) ?? null,
        scopesHash: sha256Text(config?.scopes ?? status.scopes) ?? null,
        clientSecretStrength: status.clientSecretStrength,
        clientSecretMinLength: "32",
        endpointDiscoveryHash: providerResult.endpointHashes.discovery ?? null,
        endpointAuthorizationHash: providerResult.endpointHashes.authorization ?? null,
        endpointTokenHash: providerResult.endpointHashes.token ?? null,
        endpointUserinfoHash: providerResult.endpointHashes.userinfo ?? null,
        endpointJwksHash: providerResult.endpointHashes.jwks ?? null,
        issuerHash: providerResult.endpointHashes.issuer ?? null,
        callbackHash: providerResult.endpointHashes.callback ?? null,
        errorCode: providerResult.errorCode ?? null,
        errorHash: providerResult.errorHash ?? null
      }
    });
    providers.push(providerResult);
  }

  saveDb(db);
  const passed = providers.filter((provider) => provider.status === "pass").length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight,
    generatedAt,
    baseUrl,
    summary: {
      checked: providers.length,
      passed,
      review: providers.length - passed,
      configuredProviders: providers.filter((provider) => provider.configured).length
    },
    providers
  };
}

async function resolveSsoProvider(provider: SenaEnterpriseSsoProvider, baseUrl?: string): Promise<SenaEnterpriseResolvedSsoProvider> {
  const status = ssoProviderStatus(provider);
  if (!status.configured) {
    throw new SenaEnterpriseError(`${provider} OAuth/OIDC SSO is not configured.`, 503, "sso_provider_not_configured");
  }

  const prefix = providerEnvPrefix(provider);
  let issuer = status.issuer;
  let authorizationUrl = status.authorizationUrl;
  let tokenUrl = status.tokenUrl;
  let userinfoUrl = status.userinfoUrl;
  let jwksUrl = status.jwksUrl;

  if ((!issuer || !authorizationUrl || !tokenUrl || !userinfoUrl || !jwksUrl) && status.discoveryUrl) {
    const response = await fetch(status.discoveryUrl, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new SenaEnterpriseError(`Could not load ${provider} OIDC discovery metadata.`, 502, "sso_discovery_failed");
    }
    const metadata = await response.json() as Record<string, unknown>;
    issuer = issuer || profileString(metadata, "issuer");
    authorizationUrl = authorizationUrl || profileString(metadata, "authorization_endpoint");
    tokenUrl = tokenUrl || profileString(metadata, "token_endpoint");
    userinfoUrl = userinfoUrl || profileString(metadata, "userinfo_endpoint");
    jwksUrl = jwksUrl || profileString(metadata, "jwks_uri");
  }

  if (!authorizationUrl || !tokenUrl || !userinfoUrl) {
    throw new SenaEnterpriseError(`${provider} OAuth/OIDC endpoints are incomplete.`, 500, "sso_endpoints_incomplete");
  }

  return {
    provider,
    clientId: status.clientId!,
    clientSecret: envValue(`${prefix}_CLIENT_SECRET`)!,
    scopes: status.scopes ?? "openid email profile",
    callbackUrl: ssoCallbackUrl(provider, baseUrl),
    discoveryUrl: status.discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  };
}

function emptyDb(): SenaEnterpriseDb {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDb,
    users: [],
    teams: [],
    memberships: [],
    invitations: [],
    sessions: [],
    ssoStates: [],
    authLockouts: [],
    apiRateLimits: [],
    mfaFactors: [],
    mfaSetups: [],
    mfaChallenges: [],
    passwordResetRequests: [],
    uploads: [],
    importRuns: [],
    analysisRuns: [],
    projects: [],
    projectRevisions: [],
    projectComments: [],
    projectPresence: [],
    adjudications: [],
    collaborationEvents: [],
    reliabilityRuns: [],
    validationRuns: [],
    expertReviews: [],
    platformDecisionAcceptances: [],
    releaseGateReviews: [],
    postCutoverObservations: [],
    goLiveAttestations: [],
    notifications: [],
    emailDeliveries: [],
    auditLog: []
  };
}

function roundedCoverageRate(resolved: number, queued: number) {
  if (queued === 0) return 1;
  return Number((resolved / queued).toFixed(4));
}

function reliabilityDisagreementKey(itemId: string, codeId: string) {
  return `${itemId}::${codeId}`;
}

function buildReliabilityAdjudicationCoverage(
  run: Pick<SenaEnterpriseReliabilityRun, "id" | "createdAt" | "reviewedAt" | "dashboard">,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  const queueKeys = new Set((run.dashboard.adjudicationQueue ?? []).map((disagreement) => (
    reliabilityDisagreementKey(disagreement.itemId, disagreement.codeId)
  )));
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .filter((record) => queueKeys.has(reliabilityDisagreementKey(record.itemId, record.codeId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((record) => {
      latestByDisagreement.set(reliabilityDisagreementKey(record.itemId, record.codeId), record);
    });

  const decisions = { include: 0, exclude: 0, revise: 0 };
  let updatedAt = run.reviewedAt ?? run.createdAt;
  for (const record of latestByDisagreement.values()) {
    decisions[record.decision] += 1;
    if (record.createdAt.localeCompare(updatedAt) > 0) updatedAt = record.createdAt;
  }

  const queuedDisagreements = queueKeys.size;
  const resolvedDisagreements = latestByDisagreement.size;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
    queuedDisagreements,
    resolvedDisagreements,
    unresolvedDisagreements: Math.max(queuedDisagreements - resolvedDisagreements, 0),
    coverageRate: roundedCoverageRate(resolvedDisagreements, queuedDisagreements),
    decisions,
    updatedAt
  };
}

function refreshReliabilityAdjudicationCoverage(
  db: SenaEnterpriseDb,
  run: SenaEnterpriseReliabilityRun
) {
  run.adjudicationCoverage = buildReliabilityAdjudicationCoverage(run, db.adjudications ?? []);
  return run.adjudicationCoverage;
}

function normalizeDb(db: SenaEnterpriseDb): SenaEnterpriseDb {
  return {
    ...db,
    sessions: (db.sessions ?? []).map((session) => ({
      ...session,
      sessionProfile: session.sessionProfile ?? "standard",
      ttlDays: session.ttlDays ?? sessionDays
    })),
    projectRevisions: db.projectRevisions ?? [],
    projectComments: db.projectComments ?? [],
    projectPresence: db.projectPresence ?? [],
    adjudications: db.adjudications ?? [],
    collaborationEvents: (db.collaborationEvents ?? []).map((event) => ({
      ...event,
      detail: event.detail ?? {},
      delivery: {
        ...(event.delivery ?? {}),
        provider: event.delivery?.provider ?? "webhook",
        status: event.delivery?.status ?? "pending",
        endpointHash: event.delivery?.endpointHash ?? collaborationPubSubEndpointHash() ?? "",
        queuedAt: event.delivery?.queuedAt ?? event.createdAt,
        attempts: event.delivery?.attempts ?? 0,
        maxAttempts: event.delivery?.maxAttempts ?? collaborationPubSubMaxAttempts()
      }
    })),
    ssoStates: db.ssoStates ?? [],
    authLockouts: db.authLockouts ?? [],
    apiRateLimits: db.apiRateLimits ?? [],
    mfaFactors: db.mfaFactors ?? [],
    mfaSetups: db.mfaSetups ?? [],
    mfaChallenges: db.mfaChallenges ?? [],
    passwordResetRequests: db.passwordResetRequests ?? [],
    platformDecisionAcceptances: db.platformDecisionAcceptances ?? [],
    releaseGateReviews: (db.releaseGateReviews ?? []).map((review) => ({
      ...review,
      verificationEvidence: normalizeReleaseVerificationEvidence(
        review.verificationEvidence,
        review.verificationCommand,
        review.updatedAt ?? review.createdAt,
        `Legacy release gate ${review.releaseVersion} was recorded before verification evidence capture.`
      )
    })),
    postCutoverObservations: db.postCutoverObservations ?? [],
    goLiveAttestations: db.goLiveAttestations ?? [],
    notifications: (db.notifications ?? []).map((notification) => ({
      ...notification,
      detail: notification.detail ?? {},
      webhookDelivery: notification.webhookDelivery ? {
        ...notification.webhookDelivery,
        attempts: notification.webhookDelivery.attempts ?? 0,
        maxAttempts: notification.webhookDelivery.maxAttempts ?? notificationWebhookMaxAttempts()
      } : undefined
    })),
    emailDeliveries: (db.emailDeliveries ?? []).map((delivery) => ({
      ...delivery,
      attempts: delivery.attempts ?? 0,
      maxAttempts: delivery.maxAttempts ?? emailWebhookMaxAttempts()
    })),
    auditLog: (db.auditLog ?? []).map((entry) => ({
      ...entry,
      detail: entry.detail ?? {},
      webhookDelivery: entry.webhookDelivery ? {
        ...entry.webhookDelivery,
        attempts: entry.webhookDelivery.attempts ?? 0,
        maxAttempts: entry.webhookDelivery.maxAttempts ?? auditWebhookMaxAttempts()
      } : undefined
    })),
    uploads: (db.uploads ?? []).map((upload) => ({
      ...upload,
      scanStatus: upload.scanStatus ?? "passed",
      scanEngine: upload.scanEngine ?? uploadScanEngine,
      scanFindings: upload.scanFindings ?? []
    })),
    importRuns: (db.importRuns ?? []).map((run) => ({
      ...run,
      cleaningManifest: run.cleaningManifest
    })),
    analysisRuns: db.analysisRuns ?? [],
    expertReviews: db.expertReviews ?? [],
    reliabilityRuns: (db.reliabilityRuns ?? []).map((run) => {
      const normalizedRun = {
        ...run,
        status: run.status ?? (run.disagreementCount > 0 ? "pending-adjudication" : "pending-review")
      };
      return {
        ...normalizedRun,
        adjudicationCoverage: buildReliabilityAdjudicationCoverage(normalizedRun, db.adjudications ?? [])
      };
    }),
    validationRuns: (db.validationRuns ?? []).map((run) => ({
      ...run,
      status: run.status ?? "pending-review",
      preregistrationNote: run.preregistrationNote ?? "",
      methodNote: run.methodNote ?? run.result?.guardrail ?? ""
    })),
    projects: (db.projects ?? []).map((project) => ({
      ...project,
      currentVersion: project.currentVersion ?? 1
    }))
  };
}

export function readEnterpriseDb(): SenaEnterpriseDb {
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  if (!existsSync(dbPath)) {
    const db = emptyDb();
    writeEnterpriseDb(db);
    return db;
  }

  const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
  if (parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseDb) {
    throw new SenaEnterpriseError("Unsupported SENA enterprise database schema.", 500, "unsupported_enterprise_db");
  }
  return normalizeDb(parsed);
}

export function writeEnterpriseDb(db: SenaEnterpriseDb) {
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const lockId = acquireDbWriteLock();
  const tmpPath = `${dbPath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const serialized = JSON.stringify(db, null, 2);
    JSON.parse(serialized);
    if (existsSync(dbPath)) copyFileSync(dbPath, dbBackupPath);
    writeFileSync(tmpPath, serialized);
    renameSync(tmpPath, dbPath);
  } finally {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best effort cleanup; ops health reports storage writability separately.
      }
    }
    releaseDbWriteLock(lockId);
  }
}

function saveDb(db: SenaEnterpriseDb) {
  const liveSessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  const livePresence = db.projectPresence.filter((presence) => Date.parse(presence.expiresAt) > Date.now());
  const liveSsoStates = (db.ssoStates ?? []).filter((state) => Date.parse(state.expiresAt) > Date.now());
  const liveAuthLockouts = pruneAuthLockouts(db);
  const liveApiRateLimits = pruneApiRateLimits(db);
  const liveMfaSetups = (db.mfaSetups ?? []).filter((setup) => Date.parse(setup.expiresAt) > Date.now());
  const liveMfaChallenges = (db.mfaChallenges ?? []).filter((challenge) => Date.parse(challenge.expiresAt) > Date.now());
  const livePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now());
  const retainedEmailDeliveries = (db.emailDeliveries ?? []).slice(0, 2000);
  const retainedCollaborationEvents = (db.collaborationEvents ?? []).slice(0, 2000);
  writeEnterpriseDb({
    ...db,
    sessions: liveSessions,
    projectPresence: livePresence,
    ssoStates: liveSsoStates,
    authLockouts: liveAuthLockouts,
    apiRateLimits: liveApiRateLimits,
    mfaSetups: liveMfaSetups,
    mfaChallenges: liveMfaChallenges,
    passwordResetRequests: livePasswordResetRequests,
    emailDeliveries: retainedEmailDeliveries,
    collaborationEvents: retainedCollaborationEvents
  });
}

export function createFileEnterpriseStateStore(): SenaEnterpriseStateStore {
  return createEnterpriseStateStore({
    read: readEnterpriseDb,
    write: writeEnterpriseDb,
    save: saveDb
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function authEmailDomain(email: string) {
  const domain = normalizeEmail(email).split("@")[1] || "unknown";
  return domain.replace(/[^a-z0-9.-]+/g, "-").slice(0, 128) || "unknown";
}

function authLockoutWindowMs() {
  return authLockoutWindowMinutes * 60 * 1000;
}

function authLockoutDurationMs() {
  return authLockoutMinutes * 60 * 1000;
}

function pruneAuthLockouts(db: SenaEnterpriseDb) {
  const timestamp = Date.now();
  const staleFailureCutoff = timestamp - authLockoutWindowMs();
  return (db.authLockouts ?? []).filter((lockout) => {
    const lockedUntil = lockout.lockedUntil ? Date.parse(lockout.lockedUntil) : 0;
    if (lockedUntil > timestamp) return true;
    return Date.parse(lockout.lastFailedAt) >= staleFailureCutoff;
  });
}

function authLockoutTeamId(db: SenaEnterpriseDb, user?: SenaEnterpriseUser) {
  if (!user) return undefined;
  const memberships = db.memberships.filter((membership) => membership.userId === user.id);
  return memberships.find((membership) => membership.status === "active")?.teamId ?? memberships[0]?.teamId;
}

function isAuthLockoutActive(lockout: SenaEnterpriseAuthLockout | undefined) {
  return Boolean(lockout?.lockedUntil && Date.parse(lockout.lockedUntil) > Date.now());
}

function findAuthLockout(db: SenaEnterpriseDb, email: string) {
  db.authLockouts = pruneAuthLockouts(db);
  const emailHash = authEmailHash(email);
  return db.authLockouts.find((lockout) => lockout.emailHash === emailHash);
}

function appendLockedLoginAudit(db: SenaEnterpriseDb, email: string, user: SenaEnterpriseUser | undefined, lockout: SenaEnterpriseAuthLockout) {
  appendAudit(db, {
    event: "auth.login.locked",
    userId: user?.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      method: "password",
      emailHash: lockout.emailHash,
      emailDomain: authEmailDomain(email),
      failedCount: lockout.failedCount,
      lockedUntil: lockout.lockedUntil ?? null
    }
  });
}

function recordFailedLogin(db: SenaEnterpriseDb, email: string, user?: SenaEnterpriseUser) {
  const timestamp = now();
  const timestampMs = Date.parse(timestamp);
  const emailHash = authEmailHash(email);
  const emailDomain = authEmailDomain(email);
  db.authLockouts = pruneAuthLockouts(db);
  const existingLockout = db.authLockouts.find((candidate) => candidate.emailHash === emailHash);
  let lockout: SenaEnterpriseAuthLockout;
  if (existingLockout && timestampMs - Date.parse(existingLockout.firstFailedAt) <= authLockoutWindowMs()) {
    lockout = existingLockout;
  } else {
    lockout = {
      id: id("authlock"),
      emailHash,
      emailDomain,
      failedCount: 0,
      firstFailedAt: timestamp,
      lastFailedAt: timestamp
    };
    db.authLockouts = db.authLockouts.filter((candidate) => candidate.emailHash !== emailHash);
    db.authLockouts.push(lockout);
  }

  lockout.emailDomain = emailDomain;
  lockout.failedCount += 1;
  lockout.lastFailedAt = timestamp;
  if (lockout.failedCount >= authLockoutMaxFailures) {
    lockout.lockedUntil = new Date(Date.now() + authLockoutDurationMs()).toISOString();
  }

  appendAudit(db, {
    event: "auth.login.failed",
    userId: user?.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      method: "password",
      emailHash,
      emailDomain,
      failedCount: lockout.failedCount,
      locked: isAuthLockoutActive(lockout),
      lockedUntil: lockout.lockedUntil ?? null
    }
  });
  if (isAuthLockoutActive(lockout)) {
    appendLockedLoginAudit(db, email, user, lockout);
  }
  return lockout;
}

function clearFailedLogin(db: SenaEnterpriseDb, email: string) {
  const emailHash = authEmailHash(email);
  db.authLockouts = (db.authLockouts ?? []).filter((lockout) => lockout.emailHash !== emailHash);
}

function pruneApiRateLimits(db: SenaEnterpriseDb) {
  const current = Date.now();
  return (db.apiRateLimits ?? []).filter((record) => Date.parse(record.expiresAt) > current);
}

export function enforceEnterpriseApiRateLimit(input: {
  bucket: string;
  key: string;
  limit?: number;
  windowSeconds?: number;
}) {
  const bucket = input.bucket.replace(/[^a-zA-Z0-9:._-]+/g, "-").slice(0, 96) || "api";
  const defaultLimit = bucket.includes("password_reset")
    ? passwordResetRateLimitMaxRequests
    : bucket.includes("sso")
      ? ssoRateLimitMaxRequests
      : authApiRateLimitMaxRequests;
  const defaultWindowSeconds = bucket.includes("password_reset")
    ? passwordResetRateLimitWindowSeconds
    : bucket.includes("sso")
      ? ssoRateLimitWindowSeconds
      : authApiRateLimitWindowSeconds;
  const limit = Math.max(1, Math.floor(input.limit ?? defaultLimit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds ?? defaultWindowSeconds));
  const keyHash = createHash("sha256").update(`${bucket}:${input.key || "anonymous"}`).digest("hex");
  const timestamp = now();
  const timestampMs = Date.parse(timestamp);
  const db = readEnterpriseDb();
  db.apiRateLimits = pruneApiRateLimits(db);
  let record = db.apiRateLimits.find((candidate) => candidate.bucket === bucket && candidate.keyHash === keyHash);
  if (!record || Date.parse(record.expiresAt) <= timestampMs) {
    record = {
      id: id("ratelimit"),
      bucket,
      keyHash,
      requestCount: 0,
      limit,
      windowSeconds,
      windowStartedAt: timestamp,
      expiresAt: new Date(timestampMs + windowSeconds * 1000).toISOString()
    };
    db.apiRateLimits = db.apiRateLimits.filter((candidate) => !(candidate.bucket === bucket && candidate.keyHash === keyHash));
    db.apiRateLimits.push(record);
  }

  record.limit = limit;
  record.windowSeconds = windowSeconds;
  record.requestCount += 1;
  if (record.requestCount > limit) {
    if (record.requestCount === limit + 1) {
      record.limitedAt = timestamp;
      appendAudit(db, {
        event: "security.rate_limit",
        detail: {
          bucket,
          keyHash,
          requestCount: record.requestCount,
          limit,
          windowSeconds,
          resetAt: record.expiresAt
        }
      });
    }
    saveDb(db);
    throw new SenaEnterpriseError("Too many requests. Try again after the rate-limit window resets.", 429, "api_rate_limited");
  }

  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseApiRateLimit,
    bucket,
    keyHash,
    requestCount: record.requestCount,
    limit,
    remaining: Math.max(0, limit - record.requestCount),
    resetAt: record.expiresAt
  };
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer) {
  let output = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function timingSafeStringEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function mfaKeySource(): "env-configured" | "local-default-review" {
  return envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET")
    ? "env-configured"
    : "local-default-review";
}

function mfaEncryptionKey() {
  const material = envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET") || "sena-local-enterprise-mfa-key";
  return createHash("sha256").update(material).digest();
}

function sealEnterpriseSecret(secret: string): SenaEnterpriseMfaSealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url")
  };
}

function openEnterpriseSecret(secret: SenaEnterpriseMfaSealedSecret, label = "SENA secret") {
  if (secret.algorithm !== "aes-256-gcm") {
    throw new SenaEnterpriseError(`Unsupported ${label} format.`, 500, "unsupported_sealed_secret");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(secret.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new SenaEnterpriseError(`Could not open the ${label}.`, 500, "sealed_secret_open_failed");
  }
}

function sealMfaSecret(secret: string): SenaEnterpriseMfaSealedSecret {
  return sealEnterpriseSecret(secret);
}

function openMfaSecret(secret: SenaEnterpriseMfaSealedSecret) {
  return openEnterpriseSecret(secret, "SENA MFA secret");
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", key).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % (10 ** mfaTotpDigits)).padStart(mfaTotpDigits, "0");
}

function totpCounter(timestamp = Date.now()) {
  return Math.floor(timestamp / 1000 / mfaTotpStepSeconds);
}

function verifyTotp(secret: string, code: string) {
  const normalized = code.trim().replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${mfaTotpDigits}}$`).test(normalized)) return false;
  const counter = totpCounter();
  for (let offset = -mfaTotpWindow; offset <= mfaTotpWindow; offset += 1) {
    if (timingSafeStringEqual(hotp(secret, counter + offset), normalized)) return true;
  }
  return false;
}

function mfaSetupExpiry() {
  return new Date(Date.now() + mfaSetupMinutes * 60 * 1000).toISOString();
}

function mfaChallengeExpiry() {
  return new Date(Date.now() + mfaChallengeMinutes * 60 * 1000).toISOString();
}

function passwordResetExpiry() {
  return new Date(Date.now() + passwordResetMinutes * 60 * 1000).toISOString();
}

function passwordResetTokenExposure() {
  return envValue("SENA_PASSWORD_RESET_EXPOSE_TOKEN") === "1";
}

function passwordResetDeliveryMode(emailDelivery?: SenaEnterpriseEmailDelivery): SenaEnterprisePasswordResetRequestResult["delivery"]["mode"] {
  if (passwordResetTokenExposure()) return "local-token";
  return emailDelivery ? "email-webhook" : "email-provider-required";
}

function passwordResetBaseUrl(baseUrl?: string) {
  return normalizedBaseUrl(baseUrl);
}

function invitationRegisterUrl(inviteCode: string, baseUrl?: string) {
  const url = new URL("/register", normalizedBaseUrl(baseUrl));
  url.searchParams.set("inviteCode", inviteCode);
  return url.toString();
}

function activeMfaFactor(db: SenaEnterpriseDb, userId: string) {
  return (db.mfaFactors ?? []).find((factor) => factor.userId === userId && !factor.disabledAt);
}

function mfaTeamId(context: SenaEnterpriseSessionContext) {
  return context.memberships[0]?.teamId ?? context.teams[0]?.id;
}

function mfaOtpAuthUrl(user: SenaEnterpriseUser, secret: string) {
  const label = `${mfaIssuer}:${user.email}`;
  const params = new URLSearchParams({
    secret,
    issuer: mfaIssuer,
    algorithm: "SHA1",
    digits: String(mfaTotpDigits),
    period: String(mfaTotpStepSeconds)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function createMfaChallenge(db: SenaEnterpriseDb, user: SenaEnterpriseUser) {
  const challengeToken = randomBytes(32).toString("base64url");
  const challenge: SenaEnterpriseMfaChallenge = {
    id: id("mfachal"),
    userId: user.id,
    challengeHash: tokenHash(challengeToken),
    createdAt: now(),
    expiresAt: mfaChallengeExpiry()
  };
  db.mfaChallenges = (db.mfaChallenges ?? [])
    .filter((candidate) => candidate.userId !== user.id && Date.parse(candidate.expiresAt) > Date.now());
  db.mfaChallenges.push(challenge);
  appendAudit(db, {
    event: "auth.mfa.challenge",
    userId: user.id,
    teamId: authLockoutTeamId(db, user),
    detail: { method: "totp", challengeId: challenge.id, expiresAt: challenge.expiresAt }
  });
  return {
    mfaRequired: true,
    method: "totp",
    challengeToken,
    expiresAt: challenge.expiresAt
  } satisfies SenaEnterpriseLoginMfaChallenge;
}

function verifyMfaChallenge(db: SenaEnterpriseDb, user: SenaEnterpriseUser, input: {
  mfaChallengeToken?: string;
  mfaCode?: string;
}) {
  const challenge = (db.mfaChallenges ?? []).find((candidate) => (
    candidate.userId === user.id &&
    candidate.challengeHash === tokenHash(input.mfaChallengeToken ?? "")
  ));
  const factor = activeMfaFactor(db, user.id);
  const challengeValid = Boolean(challenge && Date.parse(challenge.expiresAt) > Date.now());
  const codeValid = Boolean(factor && input.mfaCode && verifyTotp(openMfaSecret(factor.secret), input.mfaCode));
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      method: "totp",
      phase: "login",
      success: challengeValid && codeValid,
      challengeId: challenge?.id ?? null
    }
  });

  if (!challengeValid || !codeValid || !challenge || !factor) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator code is incorrect or expired.", 401, "invalid_mfa_code");
  }

  factor.lastUsedAt = now();
  db.mfaChallenges = (db.mfaChallenges ?? []).filter((candidate) => candidate.id !== challenge.id);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2-sha256$210000$${salt}$${hash}`;
}

function passwordPolicyEvidence() {
  return `${enterprisePasswordPolicy.schemaVersion}/minLength:${enterprisePasswordPolicy.minLength}/letter:number/common-blocklist/email-local-part`;
}

function validateEnterprisePassword(password: string, email?: string) {
  const trimmed = password.trim();
  const lower = trimmed.toLowerCase();
  const emailLocalPart = email ? normalizeEmail(email).split("@")[0]?.toLowerCase() : "";
  const failures = [
    trimmed.length < enterprisePasswordPolicy.minLength ? "min-length" : null,
    enterprisePasswordPolicy.requiresLetter && !/[a-z]/i.test(trimmed) ? "letter-required" : null,
    enterprisePasswordPolicy.requiresNumber && !/\d/.test(trimmed) ? "number-required" : null,
    enterprisePasswordPolicy.blocksCommonPasswords && enterprisePasswordPolicy.blockedFragments.some((fragment) => lower.includes(fragment)) ? "common-password" : null,
    enterprisePasswordPolicy.blocksEmailLocalPart && emailLocalPart && emailLocalPart.length >= 4 && lower.includes(emailLocalPart) ? "email-local-part" : null
  ].filter((failure): failure is string => Boolean(failure));
  if (failures.length > 0) {
    throw new SenaEnterpriseError(
      "Password does not meet the SENA enterprise password policy.",
      400,
      "weak_password"
    );
  }
}

function verifyPassword(password: string, stored?: string) {
  if (!stored) return false;
  const [algo, iterations, salt, expected] = stored.split("$");
  if (algo !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function appendAudit(db: SenaEnterpriseDb, entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  db.auditLog.unshift({
    id: id("audit"),
    createdAt: now(),
    ...entry,
    webhookDelivery: entry.webhookDelivery ?? initialAuditWebhookDelivery()
  });
  db.auditLog = db.auditLog.slice(0, auditRetentionMaxEvents);
}

function initialAuditWebhookDelivery(queuedAt = now()): SenaEnterpriseAuditWebhookDelivery | undefined {
  const provider = auditWebhookProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  return {
    provider: webhookQueueProvider(provider),
    status: "pending",
    endpointHash: provider.endpointHash,
    queuedAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
}

function ensureAuditWebhookDelivery(entry: SenaEnterpriseAuditLogEntry) {
  const provider = auditWebhookProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  if (!entry.webhookDelivery || entry.webhookDelivery.endpointHash !== provider.endpointHash) {
    entry.webhookDelivery = {
      provider: webhookQueueProvider(provider),
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: now(),
      attempts: 0,
      maxAttempts: provider.maxAttempts
    };
  } else {
    entry.webhookDelivery.maxAttempts = provider.maxAttempts;
  }
  return entry.webhookDelivery;
}

function queueEnterpriseNotification(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseNotificationKind;
  userId?: string;
  email?: string;
  teamId?: string;
  projectId?: string;
  title: string;
  body: string;
  actionUrl?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
}) {
  const user = input.userId ? db.users.find((candidate) => candidate.id === input.userId) : undefined;
  const email = input.email ?? user?.email;
  const createdAt = now();
  const notification: SenaEnterpriseNotification = {
    id: id("notif"),
    kind: input.kind,
    status: "delivered",
    channel: "in-app",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    recipientEmailHash: email ? authEmailHash(email) : undefined,
    recipientEmailDomain: email ? authEmailDomain(email) : undefined,
    title: input.title.trim(),
    body: input.body.trim(),
    actionUrl: input.actionUrl,
    createdAt,
    deliveredAt: createdAt,
    detail: Object.fromEntries(Object.entries(input.detail ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>,
    webhookDelivery: initialNotificationWebhookDelivery(createdAt)
  };
  db.notifications.unshift(notification);
  db.notifications = db.notifications.slice(0, 2000);
  appendAudit(db, {
    event: "notification.queue",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      notificationId: notification.id,
      kind: notification.kind,
      channel: notification.channel,
      recipient: input.userId ? "user" : email ? "email" : "team"
    }
  });
  return notification;
}

function initialNotificationWebhookDelivery(queuedAt = now()): SenaEnterpriseNotificationWebhookDelivery | undefined {
  const provider = notificationWebhookProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  return {
    provider: webhookQueueProvider(provider),
    status: "pending",
    endpointHash: provider.endpointHash,
    queuedAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
}

function ensureNotificationWebhookDelivery(notification: SenaEnterpriseNotification) {
  const provider = notificationWebhookProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  if (!notification.webhookDelivery || notification.webhookDelivery.endpointHash !== provider.endpointHash) {
    notification.webhookDelivery = {
      provider: webhookQueueProvider(provider),
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: now(),
      attempts: 0,
      maxAttempts: provider.maxAttempts
    };
  } else {
    notification.webhookDelivery.maxAttempts = provider.maxAttempts;
  }
  return notification.webhookDelivery;
}

function webhookRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function notificationWebhookPayload(
  notification: SenaEnterpriseNotification,
  delivery: SenaEnterpriseNotificationWebhookDelivery,
  attempt: number,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotificationWebhook,
    generatedAt,
    notification: {
      id: notification.id,
      kind: notification.kind,
      status: notification.status,
      channel: notification.channel,
      userId: notification.userId,
      teamId: notification.teamId,
      projectId: notification.projectId,
      recipientEmailHash: notification.recipientEmailHash,
      recipientEmailDomain: notification.recipientEmailDomain,
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      deliveredAt: notification.deliveredAt,
      readAt: notification.readAt,
      detail: notification.detail
    },
    delivery: {
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      attempt,
      maxAttempts: delivery.maxAttempts
    }
  };
}

function webhookErrorHash(error: unknown) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return createHash("sha256").update(message).digest("hex");
}

async function postNotificationWebhook(notification: SenaEnterpriseNotification, delivery: SenaEnterpriseNotificationWebhookDelivery) {
  const webhookUrl = notificationWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Notification webhook delivery is not configured.", 503, "notification_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = delivery.attempts + 1;
  const body = JSON.stringify(notificationWebhookPayload(notification, delivery, attempt, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "notification.delivery",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-notification-id": notification.id
  };
  const secret = notificationWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), notificationWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sealEmailDeliveryPayload(payload: SenaEnterpriseEmailDeliveryPayload): SenaEnterpriseMfaSealedSecret {
  return sealEnterpriseSecret(JSON.stringify(payload));
}

function openEmailDeliveryPayload(delivery: SenaEnterpriseEmailDelivery) {
  return JSON.parse(openEnterpriseSecret(delivery.sealedPayload, "SENA email delivery payload")) as SenaEnterpriseEmailDeliveryPayload;
}

function queueEnterpriseEmail(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseEmailDeliveryKind;
  recipientEmail: string;
  recipientName?: string;
  teamId?: string;
  userId?: string;
  projectId?: string;
  subject: string;
  bodyText: string;
  actionUrl?: string;
  expiresAt?: string;
  templateData?: Record<string, string | number | boolean | null | undefined>;
}) {
  const provider = emailWebhookProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const payload: SenaEnterpriseEmailDeliveryPayload = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailPayload,
    kind: input.kind,
    recipient: {
      email: recipientEmail,
      name: input.recipientName?.trim() || undefined
    },
    subject: input.subject.trim(),
    bodyText: input.bodyText.trim(),
    actionUrl: input.actionUrl,
    expiresAt: input.expiresAt,
    templateData: Object.fromEntries(Object.entries(input.templateData ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>
  };
  const queuedAt = now();
  const delivery: SenaEnterpriseEmailDelivery = {
    id: id("email"),
    kind: input.kind,
    status: "pending",
    provider: webhookQueueProvider(provider),
    endpointHash: provider.endpointHash,
    teamId: input.teamId,
    userId: input.userId,
    projectId: input.projectId,
    recipientEmailHash: authEmailHash(recipientEmail),
    recipientEmailDomain: authEmailDomain(recipientEmail),
    sealedPayload: sealEmailDeliveryPayload(payload),
    queuedAt,
    expiresAt: input.expiresAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
  db.emailDeliveries.unshift(delivery);
  db.emailDeliveries = db.emailDeliveries.slice(0, 2000);
  appendAudit(db, {
    event: "email.queue",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      emailDeliveryId: delivery.id,
      kind: delivery.kind,
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      recipientEmailHash: delivery.recipientEmailHash,
      recipientEmailDomain: delivery.recipientEmailDomain,
      expiresAt: delivery.expiresAt ?? null
    }
  });
  return delivery;
}

function emailWebhookPayload(
  emailDelivery: SenaEnterpriseEmailDelivery,
  attempt: number,
  generatedAt: string
): Record<string, unknown> {
  const payload = openEmailDeliveryPayload(emailDelivery);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailWebhook,
    generatedAt,
    email: {
      id: emailDelivery.id,
      kind: emailDelivery.kind,
      teamId: emailDelivery.teamId,
      userId: emailDelivery.userId,
      projectId: emailDelivery.projectId,
      recipientEmailHash: emailDelivery.recipientEmailHash,
      recipientEmailDomain: emailDelivery.recipientEmailDomain,
      recipient: payload.recipient,
      subject: payload.subject,
      bodyText: payload.bodyText,
      actionUrl: payload.actionUrl,
      expiresAt: payload.expiresAt,
      templateData: payload.templateData,
      queuedAt: emailDelivery.queuedAt
    },
    delivery: {
      provider: emailDelivery.provider,
      endpointHash: emailDelivery.endpointHash,
      attempt,
      maxAttempts: emailDelivery.maxAttempts
    }
  };
}

async function postEmailWebhook(emailDelivery: SenaEnterpriseEmailDelivery) {
  const webhookUrl = emailWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Email webhook delivery is not configured.", 503, "email_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = emailDelivery.attempts + 1;
  let body: string;
  try {
    body = JSON.stringify(emailWebhookPayload(emailDelivery, attempt, generatedAt));
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: "payload_open_failed",
      errorHash: webhookErrorHash(error)
    };
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "email.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-email-delivery-id": emailDelivery.id
  };
  const secret = emailWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), emailWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function notificationVisibleToContext(context: SenaEnterpriseSessionContext, notification: SenaEnterpriseNotification) {
  const userEmailHash = authEmailHash(context.user.email);
  if (notification.userId === context.user.id) return true;
  if (notification.recipientEmailHash === userEmailHash) return true;
  if (notification.teamId && hasEnterprisePermission(context, notification.teamId, "team:manage")) return true;
  return false;
}

function dbWorkingCopy(db: SenaEnterpriseDb): SenaEnterpriseDb {
  return normalizeDb(JSON.parse(JSON.stringify(db)) as SenaEnterpriseDb);
}

function provisioningMetadata(source: SenaEnterpriseProvisioningSource, externalId: string | undefined, syncedAt: string): SenaEnterpriseProvisioningMetadata {
  return {
    source,
    externalId: externalId?.trim() || undefined,
    lastSyncedAt: syncedAt
  };
}

function provisioningExternalIdMatches(record: { provisioning?: SenaEnterpriseProvisioningMetadata }, source: SenaEnterpriseProvisioningSource, externalId?: string) {
  return Boolean(externalId && record.provisioning?.source === source && record.provisioning.externalId === externalId);
}

function provisionedTeamByInput(db: SenaEnterpriseDb, source: SenaEnterpriseProvisioningSource, organization: string, input: SenaEnterpriseProvisioningTeamInput) {
  const name = input.name.trim();
  if (!name) throw new SenaEnterpriseError("Provisioned teams require a name.", 400, "invalid_provisioning_team");
  return db.teams.find((team) => provisioningExternalIdMatches(team, source, input.externalId)) ??
    db.teams.find((team) => team.name.toLowerCase() === name.toLowerCase() && team.organization.toLowerCase() === organization.toLowerCase());
}

function provisionedTeamByMembership(db: SenaEnterpriseDb, source: SenaEnterpriseProvisioningSource, organization: string, input: SenaEnterpriseProvisioningMembershipInput) {
  if (input.teamId) return db.teams.find((team) => team.id === input.teamId);
  if (input.teamExternalId) return db.teams.find((team) => provisioningExternalIdMatches(team, source, input.teamExternalId));
  if (input.teamName) {
    return db.teams.find((team) => team.name.toLowerCase() === input.teamName!.trim().toLowerCase() && team.organization.toLowerCase() === organization.toLowerCase());
  }
  return undefined;
}

function validProvisioningSource(source: unknown): source is SenaEnterpriseProvisioningSource {
  return source === "api" || source === "scim";
}

export function provisionEnterpriseOrganization(input: SenaEnterpriseProvisioningInput): SenaEnterpriseProvisioningResult {
  const source = validProvisioningSource(input.source) ? input.source : "api";
  const organization = input.organization.trim();
  if (!organization) throw new SenaEnterpriseError("Provisioning requires an organization name.", 400, "invalid_provisioning_organization");
  const dryRun = Boolean(input.dryRun);
  const savedDb = readEnterpriseDb();
  const db = dryRun ? dbWorkingCopy(savedDb) : savedDb;
  const syncedAt = now();
  const result: SenaEnterpriseProvisioningResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioning,
    generatedAt: syncedAt,
    dryRun,
    source,
    organization,
    summary: {
      teamsCreated: 0,
      teamsUpdated: 0,
      usersCreated: 0,
      usersUpdated: 0,
      membershipsCreated: 0,
      membershipsUpdated: 0
    },
    teams: [],
    users: [],
    memberships: []
  };

  for (const teamInput of input.teams ?? []) {
    const name = teamInput.name.trim();
    const plan = teamInput.plan ?? "enterprise";
    if (plan !== "individual" && plan !== "lab" && plan !== "enterprise") {
      throw new SenaEnterpriseError("Provisioned team plan is not supported.", 400, "invalid_provisioning_plan");
    }
    let team = provisionedTeamByInput(db, source, organization, teamInput);
    let status: "created" | "updated" = "updated";
    if (!team) {
      team = {
        id: id("team"),
        name,
        plan,
        organization: teamInput.organization?.trim() || organization,
        provisioning: provisioningMetadata(source, teamInput.externalId, syncedAt),
        createdAt: syncedAt,
        updatedAt: syncedAt
      };
      db.teams.push(team);
      status = "created";
      result.summary.teamsCreated += 1;
    } else {
      team.name = name;
      team.plan = plan;
      team.organization = teamInput.organization?.trim() || organization;
      team.provisioning = provisioningMetadata(source, teamInput.externalId ?? team.provisioning?.externalId, syncedAt);
      team.updatedAt = syncedAt;
      result.summary.teamsUpdated += 1;
    }
    result.teams.push({ id: team.id, externalId: team.provisioning?.externalId, name: team.name, status });
  }

  const touchedTeamIds = new Set(result.teams.map((team) => team.id));

  for (const userInput of input.users ?? []) {
    const email = normalizeEmail(userInput.email);
    if (!email.includes("@")) throw new SenaEnterpriseError("Provisioned users require a valid email.", 400, "invalid_provisioning_email");
    if (userInput.status && userInput.status !== "active" && userInput.status !== "suspended") {
      throw new SenaEnterpriseError("Provisioned user status is not supported.", 400, "invalid_provisioning_user_status");
    }
    let user = db.users.find((candidate) => provisioningExternalIdMatches(candidate, source, userInput.externalId)) ??
      db.users.find((candidate) => candidate.email === email);
    let userStatus: "created" | "updated" = "updated";
    if (!user) {
      user = {
        id: id("user"),
        email,
        name: userInput.name?.trim() || email.split("@")[0],
        organization: userInput.organization?.trim() || organization,
        ssoIdentities: [],
        provisioning: provisioningMetadata(source, userInput.externalId, syncedAt),
        createdAt: syncedAt,
        updatedAt: syncedAt
      };
      db.users.push(user);
      userStatus = "created";
      result.summary.usersCreated += 1;
    } else {
      user.email = email;
      user.name = userInput.name?.trim() || user.name;
      user.organization = userInput.organization?.trim() || organization;
      user.provisioning = provisioningMetadata(source, userInput.externalId ?? user.provisioning?.externalId, syncedAt);
      user.updatedAt = syncedAt;
      result.summary.usersUpdated += 1;
    }
    if (userInput.sso?.provider && userInput.sso.subject) {
      const subject = userInput.sso.subject.trim();
      if (!subject) throw new SenaEnterpriseError("Provisioned SSO subject cannot be empty.", 400, "invalid_provisioning_sso_subject");
      if (!ssoProviders.includes(userInput.sso.provider)) {
        throw new SenaEnterpriseError("Provisioned SSO provider is not supported.", 400, "invalid_provisioning_sso_provider");
      }
      if (!user.ssoIdentities.some((identity) => identity.provider === userInput.sso!.provider && identity.subject === subject)) {
        user.ssoIdentities.push({ provider: userInput.sso.provider, subject, linkedAt: syncedAt });
      }
    }
    result.users.push({
      id: user.id,
      externalId: user.provisioning?.externalId,
      emailHash: authEmailHash(user.email),
      emailDomain: authEmailDomain(user.email),
      status: userStatus
    });

    if (userInput.status === "suspended") {
      for (const membership of db.memberships.filter((candidate) => candidate.userId === user!.id && candidate.status !== "suspended")) {
        if (activeTeamManagerCount(db, membership.teamId, { membershipId: membership.id, role: membership.role, status: "suspended" }) === 0) {
          throw new SenaEnterpriseError("Provisioning cannot suspend the last active team manager.", 400, "last_team_manager_required");
        }
        membership.status = "suspended";
        membership.provisioning = provisioningMetadata(source, membership.provisioning?.externalId ?? `${user.provisioning?.externalId ?? user.id}:${membership.teamId}`, syncedAt);
        membership.updatedAt = syncedAt;
        result.summary.membershipsUpdated += 1;
        touchedTeamIds.add(membership.teamId);
        result.memberships.push({
          id: membership.id,
          teamId: membership.teamId,
          userId: user.id,
          role: membership.role,
          status: membership.status,
          change: "updated"
        });
      }
    }

    for (const membershipInput of userInput.memberships ?? []) {
      if (!rolePermissions[membershipInput.role]) {
        throw new SenaEnterpriseError("Provisioned membership role is not supported.", 400, "invalid_provisioning_role");
      }
      const membershipStatus = userInput.status === "suspended" ? "suspended" : membershipInput.status ?? "active";
      if (membershipStatus !== "active" && membershipStatus !== "suspended") {
        throw new SenaEnterpriseError("Provisioned membership status is not supported.", 400, "invalid_provisioning_membership_status");
      }
      const team = provisionedTeamByMembership(db, source, organization, membershipInput);
      if (!team) {
        throw new SenaEnterpriseError("Provisioned membership referenced a missing team.", 400, "provisioning_team_missing");
      }
      let membership = db.memberships.find((candidate) => candidate.teamId === team.id && candidate.userId === user!.id);
      const change: "created" | "updated" = membership ? "updated" : "created";
      if (!membership) {
        membership = {
          id: id("member"),
          teamId: team.id,
          userId: user.id,
          role: membershipInput.role,
          status: membershipStatus,
          provisioning: provisioningMetadata(source, `${user.provisioning?.externalId ?? user.id}:${team.provisioning?.externalId ?? team.id}`, syncedAt),
          createdAt: syncedAt,
          updatedAt: syncedAt
        };
        db.memberships.push(membership);
        result.summary.membershipsCreated += 1;
      } else {
        if (activeTeamManagerCount(db, team.id, { membershipId: membership.id, role: membershipInput.role, status: membershipStatus }) === 0) {
          throw new SenaEnterpriseError("Provisioning cannot remove the last active team manager.", 400, "last_team_manager_required");
        }
        membership.role = membershipInput.role;
        membership.status = membershipStatus;
        membership.provisioning = provisioningMetadata(source, membership.provisioning?.externalId ?? `${user.provisioning?.externalId ?? user.id}:${team.provisioning?.externalId ?? team.id}`, syncedAt);
        membership.updatedAt = syncedAt;
        result.summary.membershipsUpdated += 1;
      }
      touchedTeamIds.add(team.id);
      result.memberships.push({
        id: membership.id,
        teamId: team.id,
        userId: user.id,
        role: membership.role,
        status: membership.status,
        change
      });
    }
  }

  for (const teamId of touchedTeamIds) {
    if (activeTeamManagerCount(db, teamId) === 0) {
      throw new SenaEnterpriseError("Provisioned teams require at least one active owner, PI, or manager.", 400, "provisioning_team_manager_required");
    }
  }

  if (!dryRun) {
    appendAudit(db, {
      event: "provisioning.sync",
      teamId: result.teams[0]?.id,
      detail: {
        source,
        organization,
        dryRun,
        teamsCreated: result.summary.teamsCreated,
        teamsUpdated: result.summary.teamsUpdated,
        usersCreated: result.summary.usersCreated,
        usersUpdated: result.summary.usersUpdated,
        membershipsCreated: result.summary.membershipsCreated,
        membershipsUpdated: result.summary.membershipsUpdated
      }
    });
    saveDb(db);
  }
  return result;
}

export function listEnterpriseProvisioningDirectory(source: SenaEnterpriseProvisioningSource = "scim"): SenaEnterpriseProvisioningDirectory {
  const db = readEnterpriseDb();
  const users = db.users.filter((user) => user.provisioning?.source === source);
  const teams = db.teams.filter((team) => team.provisioning?.source === source);
  const teamById = new Map(db.teams.map((team) => [team.id, team]));
  const userById = new Map(db.users.map((user) => [user.id, user]));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioningDirectory,
    generatedAt: now(),
    source,
    users: users.map((user) => ({
      id: user.id,
      externalId: user.provisioning?.externalId,
      email: user.email,
      name: user.name,
      organization: user.organization,
      ssoSubjects: user.ssoIdentities.map((identity) => `${identity.provider}:${identity.subject}`),
      memberships: db.memberships
        .filter((membership) => membership.userId === user.id && membership.provisioning?.source === source)
        .map((membership) => {
          const team = teamById.get(membership.teamId);
          return {
            id: membership.id,
            teamId: membership.teamId,
            teamExternalId: team?.provisioning?.externalId,
            teamName: team?.name ?? membership.teamId,
            role: membership.role,
            status: membership.status
          };
        })
    })),
    teams: teams.map((team) => ({
      id: team.id,
      externalId: team.provisioning?.externalId,
      name: team.name,
      organization: team.organization,
      plan: team.plan,
      members: db.memberships
        .filter((membership) => membership.teamId === team.id && membership.provisioning?.source === source)
        .map((membership) => {
          const user = userById.get(membership.userId);
          return {
            userId: membership.userId,
            userExternalId: user?.provisioning?.externalId,
            display: user?.name ?? membership.userId,
            role: membership.role,
            status: membership.status
          };
        })
    }))
  };
}

function notifyTeamManagers(db: SenaEnterpriseDb, input: {
  teamId: string;
  kind: SenaEnterpriseNotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
  projectId?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  excludeUserId?: string;
}) {
  const managerIds = db.memberships
    .filter((membership) => membership.teamId === input.teamId && membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.userId)
    .filter((userId) => userId !== input.excludeUserId);
  for (const userId of Array.from(new Set(managerIds))) {
    queueEnterpriseNotification(db, { ...input, userId });
  }
}

function notifyProjectReaders(db: SenaEnterpriseDb, project: SenaEnterpriseProject, input: {
  kind: SenaEnterpriseNotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  excludeUserId?: string;
}) {
  const readerIds = db.memberships
    .filter((membership) => (
      membership.teamId === project.teamId &&
      membership.status === "active" &&
      rolePermissions[membership.role].includes("project:read")
    ))
    .map((membership) => membership.userId)
    .filter((userId) => userId !== input.excludeUserId);
  for (const userId of Array.from(new Set(readerIds))) {
    queueEnterpriseNotification(db, {
      ...input,
      userId,
      teamId: project.teamId,
      projectId: project.id
    });
  }
}

function sessionExpiry(ttlDays = sessionDays) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

function csrfKeySource(): "env-configured" | "session-secret" | "local-default-review" {
  if (envValue("SENA_CSRF_SECRET")) return "env-configured";
  if (envValue("SENA_SESSION_SECRET")) return "session-secret";
  return "local-default-review";
}

function csrfKeyMaterial() {
  return envValue("SENA_CSRF_SECRET") || envValue("SENA_SESSION_SECRET") || "sena-local-enterprise-csrf-key";
}

function csrfTokenMessage(session: SenaEnterpriseSession) {
  return [session.id, session.userId, session.expiresAt, session.tokenHash].join(".");
}

function csrfTokenForSession(session: SenaEnterpriseSession) {
  return `${session.id}.${createHmac("sha256", csrfKeyMaterial()).update(csrfTokenMessage(session)).digest("base64url")}`;
}

function createSession(db: SenaEnterpriseDb, userId: string, input: { rememberSession?: boolean } = {}) {
  const rawToken = randomBytes(32).toString("base64url");
  const sessionProfile: SenaEnterpriseSessionProfile = input.rememberSession ? "remembered" : "standard";
  const ttlDays = sessionProfile === "remembered" ? rememberedSessionDays : standardSessionDays;
  const session: SenaEnterpriseSession = {
    id: id("sess"),
    userId,
    tokenHash: tokenHash(rawToken),
    createdAt: now(),
    expiresAt: sessionExpiry(ttlDays),
    sessionProfile,
    ttlDays
  };
  db.sessions.push(session);
  return { rawToken, session };
}

function publicUser(user: SenaEnterpriseUser) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function sanitizeEnterpriseContext(context: SenaEnterpriseSessionContext) {
  return {
    user: publicUser(context.user),
    session: {
      id: context.session.id,
      createdAt: context.session.createdAt,
      expiresAt: context.session.expiresAt,
      sessionProfile: context.session.sessionProfile,
      ttlDays: context.session.ttlDays
    },
    memberships: context.memberships,
    teams: context.teams,
    permissions: context.memberships.flatMap((membership) => rolePermissions[membership.role].map((permission) => ({
      teamId: membership.teamId,
      permission
    })))
  };
}

export function registerEnterpriseUser(input: {
  name: string;
  email: string;
  password: string;
  organization: string;
  plan?: SenaEnterpriseTeam["plan"];
  inviteCode?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new SenaEnterpriseError("A valid email is required.", 400, "invalid_email");
  validateEnterprisePassword(input.password, email);

  const db = readEnterpriseDb();
  if (db.users.some((user) => user.email === email)) {
    throw new SenaEnterpriseError("An account already exists for this email.", 409, "email_exists");
  }

  const timestamp = now();
  const user: SenaEnterpriseUser = {
    id: id("user"),
    email,
    name: input.name.trim() || email.split("@")[0],
    organization: input.organization.trim() || email.split("@")[1] || "SENA Research Team",
    passwordHash: hashPassword(input.password),
    ssoIdentities: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.users.push(user);

  const pendingInvite = requirePendingInvitationForEmail(db, input.inviteCode, email);

  let team: SenaEnterpriseTeam;
  let role: SenaEnterpriseRole;
  if (pendingInvite) {
    const invitedTeam = db.teams.find((candidate) => candidate.id === pendingInvite.teamId);
    if (!invitedTeam) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
    team = invitedTeam;
    role = pendingInvite.role;
    pendingInvite.status = "accepted";
    pendingInvite.acceptedAt = timestamp;
  } else {
    team = {
      id: id("team"),
      name: input.organization.trim() || `${user.name}'s SENA Workspace`,
      plan: input.plan ?? "lab",
      organization: user.organization,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.teams.push(team);
    role = "owner";
  }

  db.memberships.push({
    id: id("member"),
    teamId: team.id,
    userId: user.id,
    role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  });

  const session = createSession(db, user.id);
  appendAudit(db, { event: "auth.register", userId: user.id, teamId: team.id, detail: { plan: team.plan, role } });
  if (pendingInvite) {
    appendAudit(db, {
      event: "team.invite.accept",
      userId: user.id,
      teamId: pendingInvite.teamId,
      detail: {
        invitationId: pendingInvite.id,
        role: pendingInvite.role,
        method: "registration"
      }
    });
  }
  saveDb(db);
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export function getEnterpriseMfaStatus(context: SenaEnterpriseSessionContext): SenaEnterpriseMfaStatus {
  const db = readEnterpriseDb();
  const factor = activeMfaFactor(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: Boolean(factor),
    method: factor ? "totp" : null,
    factorId: factor?.id,
    verifiedAt: factor?.verifiedAt,
    lastUsedAt: factor?.lastUsedAt
  };
}

export function createEnterpriseMfaSetup(context: SenaEnterpriseSessionContext): SenaEnterpriseMfaSetupResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  if (activeMfaFactor(db, user.id)) {
    throw new SenaEnterpriseError("Authenticator MFA is already enabled.", 409, "mfa_already_enabled");
  }

  const secret = base32Encode(randomBytes(20));
  const setupToken = randomBytes(32).toString("base64url");
  const setup: SenaEnterpriseMfaSetup = {
    id: id("mfasetup"),
    userId: user.id,
    setupTokenHash: tokenHash(setupToken),
    secret: sealMfaSecret(secret),
    createdAt: now(),
    expiresAt: mfaSetupExpiry()
  };
  db.mfaSetups = (db.mfaSetups ?? []).filter((candidate) => candidate.userId !== user.id && Date.parse(candidate.expiresAt) > Date.now());
  db.mfaSetups.push(setup);
  appendAudit(db, {
    event: "auth.mfa.setup",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", setupId: setup.id, expiresAt: setup.expiresAt }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaSetup,
    method: "totp",
    setupToken,
    secret,
    otpauthUrl: mfaOtpAuthUrl(user, secret),
    expiresAt: setup.expiresAt
  };
}

export function enableEnterpriseMfa(context: SenaEnterpriseSessionContext, input: {
  setupToken: string;
  code: string;
  label?: string;
}): SenaEnterpriseMfaEnableResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  if (activeMfaFactor(db, user.id)) {
    throw new SenaEnterpriseError("Authenticator MFA is already enabled.", 409, "mfa_already_enabled");
  }

  const setup = (db.mfaSetups ?? []).find((candidate) => (
    candidate.userId === user.id &&
    candidate.setupTokenHash === tokenHash(input.setupToken)
  ));
  const setupValid = Boolean(setup && Date.parse(setup.expiresAt) > Date.now());
  const secret = setup ? openMfaSecret(setup.secret) : "";
  const codeValid = setupValid && verifyTotp(secret, input.code);
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: {
      method: "totp",
      phase: "setup",
      success: codeValid,
      setupId: setup?.id ?? null
    }
  });
  if (!setup || !setupValid || !codeValid) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator setup code is incorrect or expired.", 401, "invalid_mfa_code");
  }

  const verifiedAt = now();
  const factor: SenaEnterpriseMfaFactor = {
    id: id("mfafactor"),
    userId: user.id,
    type: "totp",
    label: input.label?.trim().slice(0, 80) || "Authenticator app",
    secret: setup.secret,
    createdAt: verifiedAt,
    verifiedAt
  };
  db.mfaFactors.push(factor);
  db.mfaSetups = (db.mfaSetups ?? []).filter((candidate) => candidate.id !== setup.id);
  appendAudit(db, {
    event: "auth.mfa.enable",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", factorId: factor.id }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: true,
    method: "totp",
    factorId: factor.id,
    verifiedAt
  };
}

export function disableEnterpriseMfa(context: SenaEnterpriseSessionContext, input: { code: string }): SenaEnterpriseMfaDisableResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  const factor = activeMfaFactor(db, user.id);
  if (!factor) throw new SenaEnterpriseError("Authenticator MFA is not enabled.", 404, "mfa_not_enabled");

  const success = verifyTotp(openMfaSecret(factor.secret), input.code);
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: {
      method: "totp",
      phase: "disable",
      success,
      factorId: factor.id
    }
  });
  if (!success) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator code is incorrect.", 401, "invalid_mfa_code");
  }

  const disabledAt = now();
  factor.disabledAt = disabledAt;
  appendAudit(db, {
    event: "auth.mfa.disable",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", factorId: factor.id }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: false,
    method: null,
    disabledAt
  };
}

export function createEnterprisePasswordReset(input: {
  email: string;
  baseUrl?: string;
}): SenaEnterprisePasswordResetRequestResult {
  const db = readEnterpriseDb();
  const email = normalizeEmail(input.email);
  const emailHash = authEmailHash(email);
  const emailDomain = authEmailDomain(email);
  const user = db.users.find((candidate) => candidate.email === email);
  const expiresAt = passwordResetExpiry();
  const resetToken = randomBytes(32).toString("base64url");
  const resetUrl = new URL("/reset-password", passwordResetBaseUrl(input.baseUrl));
  resetUrl.searchParams.set("token", resetToken);

  db.passwordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => request.emailHash !== emailHash && Date.parse(request.expiresAt) > Date.now() && !request.usedAt);

  let emailDelivery: SenaEnterpriseEmailDelivery | undefined;
  if (user) {
    const request: SenaEnterprisePasswordResetRequest = {
      id: id("pwreset"),
      userId: user.id,
      emailHash,
      emailDomain,
      tokenHash: tokenHash(resetToken),
      createdAt: now(),
      expiresAt
    };
    db.passwordResetRequests.push(request);
    emailDelivery = queueEnterpriseEmail(db, {
      kind: "auth.password_reset",
      recipientEmail: user.email,
      recipientName: user.name,
      userId: user.id,
      teamId: authLockoutTeamId(db, user),
      subject: "Reset your SENA password",
      bodyText: "A password reset was requested for your SENA account. Use the secure link before it expires.",
      actionUrl: resetUrl.toString(),
      expiresAt,
      templateData: {
        resetRequestId: request.id,
        expiresAt,
        userName: user.name
      }
    });
  }

  appendAudit(db, {
    event: "auth.password_reset.request",
    userId: user?.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      emailHash,
      emailDomain,
      delivery: passwordResetDeliveryMode(emailDelivery),
      emailDeliveryId: emailDelivery?.id ?? null,
      expiresAt
    }
  });
  if (user) {
    queueEnterpriseNotification(db, {
      kind: "auth.password_reset",
      userId: user.id,
      email: user.email,
      teamId: authLockoutTeamId(db, user),
      title: "SENA password reset requested",
      body: "A password reset was requested for your SENA account.",
      actionUrl: "/reset-password",
      detail: {
        expiresAt,
        delivery: passwordResetDeliveryMode(emailDelivery),
        emailDeliveryId: emailDelivery?.id ?? null
      }
    });
  }
  saveDb(db);

  const delivery: SenaEnterprisePasswordResetRequestResult["delivery"] = {
    mode: passwordResetDeliveryMode(emailDelivery),
    emailDeliveryId: emailDelivery?.id
  };
  if (passwordResetTokenExposure()) {
    delivery.resetToken = user ? resetToken : randomBytes(32).toString("base64url");
    const exposedResetUrl = new URL("/reset-password", passwordResetBaseUrl(input.baseUrl));
    exposedResetUrl.searchParams.set("token", delivery.resetToken);
    delivery.resetUrl = exposedResetUrl.toString();
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordResetRequest,
    status: "queued",
    expiresAt,
    delivery
  };
}

export function completeEnterprisePasswordReset(input: {
  resetToken: string;
  password: string;
}): SenaEnterprisePasswordResetCompleteResult {
  validateEnterprisePassword(input.password);
  const db = readEnterpriseDb();
  const resetHash = tokenHash(input.resetToken);
  const request = (db.passwordResetRequests ?? []).find((candidate) => (
    candidate.tokenHash === resetHash &&
    !candidate.usedAt &&
    Date.parse(candidate.expiresAt) > Date.now()
  ));
  if (!request?.userId) {
    throw new SenaEnterpriseError("Password reset link is invalid or expired.", 401, "invalid_password_reset_token");
  }
  const user = db.users.find((candidate) => candidate.id === request.userId);
  if (!user) {
    throw new SenaEnterpriseError("Password reset user is no longer available.", 410, "password_reset_user_missing");
  }
  validateEnterprisePassword(input.password, user.email);

  const resetAt = now();
  user.passwordHash = hashPassword(input.password);
  user.updatedAt = resetAt;
  request.usedAt = resetAt;
  db.sessions = db.sessions.filter((session) => session.userId !== user.id);
  db.mfaChallenges = (db.mfaChallenges ?? []).filter((challenge) => challenge.userId !== user.id);
  clearFailedLogin(db, user.email);
  appendAudit(db, {
    event: "auth.password_reset.complete",
    userId: user.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      emailHash: request.emailHash,
      emailDomain: request.emailDomain,
      resetRequestId: request.id,
      sessionsRevoked: true
    }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordResetComplete,
    status: "completed",
    resetAt
  };
}

export function loginEnterpriseUser(input: {
  email: string;
  password: string;
  mfaCode?: string;
  mfaChallengeToken?: string;
  rememberSession?: boolean;
}): SenaEnterpriseLoginResult {
  const db = readEnterpriseDb();
  const email = normalizeEmail(input.email);
  const user = db.users.find((candidate) => candidate.email === email);
  const existingLockout = findAuthLockout(db, email);
  if (isAuthLockoutActive(existingLockout)) {
    appendLockedLoginAudit(db, email, user, existingLockout!);
    saveDb(db);
    throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    const failedLockout = recordFailedLogin(db, email, user);
    saveDb(db);
    if (isAuthLockoutActive(failedLockout)) {
      throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
    }
    throw new SenaEnterpriseError("Email or password is incorrect.", 401, "invalid_credentials");
  }

  if (activeMfaFactor(db, user.id)) {
    if (!input.mfaCode || !input.mfaChallengeToken) {
      const challenge = createMfaChallenge(db, user);
      saveDb(db);
      return challenge;
    }
    verifyMfaChallenge(db, user, {
      mfaCode: input.mfaCode,
      mfaChallengeToken: input.mfaChallengeToken
    });
  }

  clearFailedLogin(db, email);
  const session = createSession(db, user.id, { rememberSession: input.rememberSession });
  appendAudit(db, {
    event: "auth.login",
    userId: user.id,
    detail: {
      method: "password",
      mfa: Boolean(activeMfaFactor(db, user.id)),
      sessionProfile: session.session.sessionProfile,
      ttlDays: session.session.ttlDays
    }
  });
  saveDb(db);
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export async function createEnterpriseSsoAuthorization(input: {
  provider: SenaEnterpriseSsoProvider;
  baseUrl?: string;
  redirectTo?: string;
  inviteCode?: string;
}) {
  const provider = input.provider;
  const config = await resolveSsoProvider(provider, input.baseUrl);
  const rawState = randomBytes(32).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const db = readEnterpriseDb();
  const ssoState: SenaEnterpriseSsoState = {
    id: id("sso"),
    provider,
    stateHash: tokenHash(rawState),
    nonce,
    codeVerifier,
    redirectTo: safeRedirectTo(input.redirectTo),
    inviteCode: safeInviteCode(input.inviteCode),
    createdAt: now(),
    expiresAt: ssoStateExpiry()
  };
  db.ssoStates.push(ssoState);
  appendAudit(db, {
    event: "auth.sso",
    detail: {
      provider,
      phase: "start",
      mode: "oauth-oidc",
      pkce: "S256",
      nonce: "state-bound",
      invite: ssoState.inviteCode ? "present" : "none"
    }
  });
  saveDb(db);

  const authorizationUrl = new URL(config.authorizationUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizationUrl.searchParams.set("scope", config.scopes);
  authorizationUrl.searchParams.set("state", rawState);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.ssoAuthorization,
    mode: "oauth-oidc" as const,
    provider,
    authorizationUrl: authorizationUrl.toString(),
    callbackUrl: config.callbackUrl,
    scopes: config.scopes.split(/\s+/).filter(Boolean),
    expiresAt: ssoState.expiresAt
  };
}

function profileEmail(provider: SenaEnterpriseSsoProvider, profile: Record<string, unknown>, subject: string) {
  const email = profileString(profile, "email") || profileString(profile, "preferred_username");
  return email?.includes("@") ? email : subjectEmailFallback(provider, subject);
}

function profileName(profile: Record<string, unknown>, email: string) {
  const fullName = profileString(profile, "name");
  if (fullName) return fullName;
  const joined = [profileString(profile, "given_name"), profileString(profile, "family_name")].filter(Boolean).join(" ");
  return joined || profileString(profile, "preferred_username") || email.split("@")[0];
}

function profileOrganization(profile: Record<string, unknown>, email: string) {
  return profileString(profile, "hd") ||
    profileString(profile, "organization") ||
    profileString(profile, "institution") ||
    email.split("@")[1] ||
    "SENA Research Team";
}

export async function completeEnterpriseSsoCallback(input: {
  code: string;
  state: string;
  provider?: SenaEnterpriseSsoProvider;
  baseUrl?: string;
}) {
  const stateHash = tokenHash(input.state);
  const db = readEnterpriseDb();
  const stateIndex = db.ssoStates.findIndex((candidate) => candidate.stateHash === stateHash);
  const ssoState = stateIndex >= 0 ? db.ssoStates[stateIndex] : undefined;
  if (!ssoState) throw new SenaEnterpriseError("SSO state is invalid or expired.", 401, "invalid_sso_state");
  if (Date.parse(ssoState.expiresAt) <= Date.now()) {
    db.ssoStates.splice(stateIndex, 1);
    saveDb(db);
    throw new SenaEnterpriseError("SSO state has expired.", 401, "expired_sso_state");
  }
  if (input.provider && input.provider !== ssoState.provider) {
    throw new SenaEnterpriseError("SSO provider does not match the saved state.", 400, "sso_provider_mismatch");
  }

  const provider = ssoState.provider;
  const config = await resolveSsoProvider(provider, input.baseUrl);
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: ssoState.codeVerifier
  });
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody
  });
  if (!tokenResponse.ok) {
    throw new SenaEnterpriseError(`${provider} token exchange failed.`, 502, "sso_token_exchange_failed");
  }
  const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
  const accessToken = profileString(tokenPayload, "access_token");
  if (!accessToken) throw new SenaEnterpriseError(`${provider} token response did not include an access token.`, 502, "sso_access_token_missing");
  const idToken = profileString(tokenPayload, "id_token");
  if (idToken) {
    try {
      await validateSsoIdTokenBinding({
        provider,
        idToken,
        expectedNonce: ssoState.nonce,
        clientId: config.clientId,
        expectedIssuer: config.issuer,
        jwksUrl: config.jwksUrl
      });
    } catch (error) {
      db.ssoStates.splice(stateIndex, 1);
      saveDb(db);
      throw error;
    }
  }

  const userinfoResponse = await fetch(config.userinfoUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userinfoResponse.ok) {
    throw new SenaEnterpriseError(`${provider} userinfo request failed.`, 502, "sso_userinfo_failed");
  }
  const profile = await userinfoResponse.json() as Record<string, unknown>;
  const subject = profileString(profile, "sub") || profileString(profile, "id");
  if (!subject) throw new SenaEnterpriseError(`${provider} userinfo response did not include a subject.`, 502, "sso_subject_missing");
  const email = profileEmail(provider, profile, subject);

  db.ssoStates.splice(stateIndex, 1);
  saveDb(db);

  const result = ssoEnterpriseUser({
    provider,
    email,
    name: profileName(profile, email),
    organization: profileOrganization(profile, email),
    subject,
    inviteCode: ssoState.inviteCode
  });
  return {
    ...result,
    redirectTo: ssoState.redirectTo,
    provider
  };
}

export function ssoEnterpriseUser(input: {
  provider: SenaEnterpriseSsoProvider;
  email: string;
  name?: string;
  organization?: string;
  subject?: string;
  inviteCode?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new SenaEnterpriseError("A valid email is required for SSO.", 400, "invalid_email");
  const db = readEnterpriseDb();
  const timestamp = now();
  let user = db.users.find((candidate) => candidate.email === email);
  const pendingInvite = requirePendingInvitationForEmail(db, input.inviteCode, email);

  if (!user) {
    user = {
      id: id("user"),
      email,
      name: input.name?.trim() || email.split("@")[0],
      organization: input.organization?.trim() || email.split("@")[1] || "SENA Research Team",
      ssoIdentities: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.users.push(user);
    if (!pendingInvite) {
      const team: SenaEnterpriseTeam = {
        id: id("team"),
        name: input.organization?.trim() || `${user.name}'s SENA Workspace`,
        plan: "lab",
        organization: user.organization,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      db.teams.push(team);
      db.memberships.push({
        id: id("member"),
        teamId: team.id,
        userId: user.id,
        role: "owner",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  if (pendingInvite) {
    const invitedTeam = db.teams.find((candidate) => candidate.id === pendingInvite.teamId);
    if (!invitedTeam) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
    const existingMembership = db.memberships.find((membership) => membership.teamId === pendingInvite.teamId && membership.userId === user.id);
    if (!existingMembership) {
      db.memberships.push({
        id: id("member"),
        teamId: pendingInvite.teamId,
        userId: user.id,
        role: pendingInvite.role,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } else {
      existingMembership.role = pendingInvite.role;
      existingMembership.status = "active";
      existingMembership.updatedAt = timestamp;
    }
    pendingInvite.status = "accepted";
    pendingInvite.acceptedAt = timestamp;
    appendAudit(db, {
      event: "team.invite.accept",
      userId: user.id,
      teamId: pendingInvite.teamId,
      detail: {
        invitationId: pendingInvite.id,
        role: pendingInvite.role,
        method: "sso"
      }
    });
  }

  const subject = input.subject || email;
  if (!user.ssoIdentities.some((identity) => identity.provider === input.provider && identity.subject === subject)) {
    user.ssoIdentities.push({ provider: input.provider, subject, linkedAt: timestamp });
    user.updatedAt = timestamp;
  }

  const session = createSession(db, user.id);
  appendAudit(db, {
    event: "auth.sso",
    userId: user.id,
    teamId: pendingInvite?.teamId,
    detail: {
      provider: input.provider,
      inviteAccepted: Boolean(pendingInvite)
    }
  });
  saveDb(db);
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export function logoutEnterpriseSession(token: string | undefined) {
  if (!token) return;
  const db = readEnterpriseDb();
  const hash = tokenHash(token);
  const session = db.sessions.find((candidate) => candidate.tokenHash === hash);
  db.sessions = db.sessions.filter((candidate) => candidate.tokenHash !== hash);
  if (session) appendAudit(db, { event: "auth.logout", userId: session.userId, detail: { sessionId: session.id } });
  saveDb(db);
}

function sessionSummary(session: SenaEnterpriseSession, currentSessionId: string): SenaEnterpriseSessionSummary {
  const sessionProfile = session.sessionProfile ?? "standard";
  const ttlDays = session.ttlDays ?? (sessionProfile === "remembered" ? rememberedSessionDays : standardSessionDays);
  return {
    id: session.id,
    current: session.id === currentSessionId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    expiresInSeconds: Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
    sessionProfile,
    ttlDays
  };
}

function liveUserSessions(db: SenaEnterpriseDb, userId: string) {
  return db.sessions
    .filter((session) => session.userId === userId && Date.parse(session.expiresAt) > Date.now())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listEnterpriseSessions(context: SenaEnterpriseSessionContext): SenaEnterpriseSessionList {
  const db = readEnterpriseDb();
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  const sessions = liveUserSessions(db, context.user.id);
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionList,
    generatedAt: now(),
    currentSessionId: context.session.id,
    sessionDays,
    sessionPolicy: {
      standardDays: standardSessionDays,
      rememberedDays: rememberedSessionDays
    },
    sessions: sessions.map((session) => sessionSummary(session, context.session.id))
  };
}

export function createEnterpriseCsrfToken(context: SenaEnterpriseSessionContext): SenaEnterpriseCsrfToken {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCsrfToken,
    generatedAt: now(),
    headerName: senaCsrfHeaderName,
    token: csrfTokenForSession(context.session),
    sessionId: context.session.id,
    expiresAt: context.session.expiresAt,
    keySource: csrfKeySource()
  };
}

export function verifyEnterpriseCsrfToken(context: SenaEnterpriseSessionContext, token: string | null | undefined) {
  const expected = csrfTokenForSession(context.session);
  const valid = typeof token === "string" && token.length > 0 && timingSafeStringEqual(token, expected);
  if (!valid) {
    const db = readEnterpriseDb();
    appendAudit(db, {
      event: "security.csrf.fail",
      userId: context.user.id,
      teamId: context.teams[0]?.id,
      detail: {
        sessionId: context.session.id,
        tokenPresent: Boolean(token),
        tokenHash: token ? (sha256Text(token) ?? null) : null,
        headerName: senaCsrfHeaderName
      }
    });
    saveDb(db);
    throw new SenaEnterpriseError("CSRF token is missing or invalid.", 403, "csrf_invalid");
  }
  return true;
}

export function revokeEnterpriseSessions(context: SenaEnterpriseSessionContext, input: {
  sessionId?: string;
  revokeOtherSessions?: boolean;
  revokeAllSessions?: boolean;
} = {}): SenaEnterpriseSessionRevocation {
  const db = readEnterpriseDb();
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  const userSessions = liveUserSessions(db, context.user.id);
  const targetIds = new Set<string>();
  if (input.revokeAllSessions) {
    userSessions.forEach((session) => targetIds.add(session.id));
  } else if (input.revokeOtherSessions) {
    userSessions
      .filter((session) => session.id !== context.session.id)
      .forEach((session) => targetIds.add(session.id));
  } else if (input.sessionId) {
    const session = userSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session) throw new SenaEnterpriseError("Session was not found.", 404, "session_not_found");
    targetIds.add(session.id);
  } else {
    throw new SenaEnterpriseError("A sessionId or revoke action is required.", 400, "session_revoke_target_required");
  }

  const revokedSessionIds = userSessions
    .filter((session) => targetIds.has(session.id))
    .map((session) => session.id);
  db.sessions = db.sessions.filter((session) => !targetIds.has(session.id));
  appendAudit(db, {
    event: "auth.session.revoke",
    userId: context.user.id,
    teamId: context.teams[0]?.id,
    detail: {
      revokedCount: revokedSessionIds.length,
      currentSessionRevoked: revokedSessionIds.includes(context.session.id),
      mode: input.revokeAllSessions ? "all" : input.revokeOtherSessions ? "others" : "single"
    }
  });
  saveDb(db);
  const remainingSessions = liveUserSessions(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionRevocation,
    generatedAt: now(),
    revokedSessionIds,
    revokedCount: revokedSessionIds.length,
    currentSessionRevoked: revokedSessionIds.includes(context.session.id),
    remainingSessions: remainingSessions.map((session) => sessionSummary(session, context.session.id))
  };
}

function contextFromDb(db: SenaEnterpriseDb, session: SenaEnterpriseSession): SenaEnterpriseSessionContext {
  if (Date.parse(session.expiresAt) <= Date.now()) throw new SenaEnterpriseError("Session expired.", 401, "session_expired");
  const user = db.users.find((candidate) => candidate.id === session.userId);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  const memberships = db.memberships.filter((membership) => membership.userId === user.id && membership.status === "active");
  const teamIds = new Set(memberships.map((membership) => membership.teamId));
  const teams = db.teams.filter((team) => teamIds.has(team.id));
  return { user, session, memberships, teams };
}

export function getEnterpriseSession(token: string | undefined): SenaEnterpriseSessionContext | null {
  if (!token) return null;
  const db = readEnterpriseDb();
  const session = db.sessions.find((candidate) => candidate.tokenHash === tokenHash(token));
  if (!session) return null;
  return contextFromDb(db, session);
}

export function requireEnterpriseSession(token: string | undefined): SenaEnterpriseSessionContext {
  const context = getEnterpriseSession(token);
  if (!context) throw new SenaEnterpriseError("Sign in is required.", 401, "auth_required");
  return context;
}

export function hasEnterprisePermission(
  context: SenaEnterpriseSessionContext,
  teamId: string,
  permission: SenaEnterprisePermission
) {
  return context.memberships.some((membership) => (
    membership.teamId === teamId &&
    membership.status === "active" &&
    rolePermissions[membership.role].includes(permission)
  ));
}

export function requireEnterprisePermission(
  context: SenaEnterpriseSessionContext,
  teamId: string,
  permission: SenaEnterprisePermission
) {
  if (!hasEnterprisePermission(context, teamId, permission)) {
    throw new SenaEnterpriseError("Your SENA role does not allow this action.", 403, "permission_denied");
  }
}

function snapshotCounts(snapshot: SenaProjectSnapshot) {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  return {
    people: source.people.length,
    interactions: source.interactions.length,
    utterances: source.utterances.length,
    codedSegments: source.coded_segments.length,
    codes: source.codebook.length
  };
}

function revisionSummary(snapshot: SenaProjectSnapshot) {
  const counts = snapshotCounts(snapshot);
  return `${counts.people} people, ${counts.codes} codes, ${counts.utterances} utterances; claim=${snapshot.report.claimReadinessGate.claimUse}`;
}

function buildProjectRevision(project: SenaEnterpriseProject, userId: string, version: number, summary?: string): SenaEnterpriseProjectRevision {
  return {
    id: id("rev"),
    projectId: project.id,
    teamId: project.teamId,
    userId,
    version,
    summary: summary?.trim() || revisionSummary(project.snapshot),
    snapshot: project.snapshot,
    datasetCounts: project.datasetCounts,
    activeWindowLabel: project.activeWindowLabel,
    claimUse: project.claimUse,
    createdAt: now()
  };
}

function visiblePresence(db: SenaEnterpriseDb, projectId: string) {
  const current = Date.now();
  return db.projectPresence.filter((presence) => presence.projectId === projectId && Date.parse(presence.expiresAt) > current);
}

export function listEnterpriseProjects(context: SenaEnterpriseSessionContext) {
  const db = readEnterpriseDb();
  const allowedTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("project:read"))
    .map((membership) => membership.teamId));

  return db.projects
    .filter((project) => allowedTeamIds.has(project.teamId))
    .map(({ snapshot: _snapshot, ...project }) => project)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createEnterpriseProject(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  title: string;
  description?: string;
  snapshot: SenaProjectSnapshot;
}) {
  requireEnterprisePermission(context, input.teamId, "project:create");
  const db = readEnterpriseDb();
  const timestamp = now();
  const project: SenaEnterpriseProject = {
    id: id("project"),
    teamId: input.teamId,
    ownerId: context.user.id,
    currentVersion: 1,
    title: input.title.trim() || input.snapshot.title || "Untitled SENA Project",
    description: input.description?.trim() ?? "",
    snapshot: input.snapshot,
    datasetCounts: snapshotCounts(input.snapshot),
    activeWindowLabel: input.snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: input.snapshot.report.claimReadinessGate.claimUse,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.projects.push(project);
  db.projectRevisions.push(buildProjectRevision(project, context.user.id, 1, "Initial project snapshot"));
  appendAudit(db, { event: "project.create", userId: context.user.id, teamId: input.teamId, projectId: project.id, detail: { title: project.title } });
  saveDb(db);
  return project;
}

export function getEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  appendAudit(db, { event: "project.read", userId: context.user.id, teamId: project.teamId, projectId: project.id, detail: { title: project.title } });
  saveDb(db);
  return project;
}

function assertEnterpriseProjectExpectedVersion(project: SenaEnterpriseProject, expectedVersion?: number) {
  if (expectedVersion === undefined) return;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new SenaEnterpriseError("Project expectedVersion must be a positive integer.", 400, "project_invalid_expected_version");
  }
  if (project.currentVersion !== expectedVersion) {
    throw new SenaEnterpriseError(
      `Project version conflict: current version is ${project.currentVersion}, but the update was based on version ${expectedVersion}.`,
      409,
      "project_version_conflict"
    );
  }
}

export function updateEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string, input: {
  title?: string;
  description?: string;
  snapshot?: SenaProjectSnapshot;
  expectedVersion?: number;
}) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  if (input.title !== undefined) project.title = input.title.trim() || project.title;
  if (input.description !== undefined) project.description = input.description.trim();
  if (input.snapshot) {
    project.snapshot = input.snapshot;
    project.datasetCounts = snapshotCounts(input.snapshot);
    project.activeWindowLabel = input.snapshot.source.activeTemporalWindow?.label ?? "Full conversation";
    project.claimUse = input.snapshot.report.claimReadinessGate.claimUse;
    project.currentVersion += 1;
    db.projectRevisions.push(buildProjectRevision(project, context.user.id, project.currentVersion));
  }
  project.updatedAt = now();
  appendAudit(db, { event: "project.update", userId: context.user.id, teamId: project.teamId, projectId: project.id, detail: { title: project.title } });
  saveDb(db);
  return project;
}

export function restoreEnterpriseProjectRevision(context: SenaEnterpriseSessionContext, projectId: string, input: {
  revisionId?: string;
  version?: number;
  expectedVersion?: number;
}) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  const targetRevision = input.revisionId
    ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.id === input.revisionId)
    : Number.isInteger(input.version)
      ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.version === input.version)
      : undefined;
  if (!targetRevision) throw new SenaEnterpriseError("Project revision was not found.", 404, "project_revision_not_found");
  if (targetRevision.version === project.currentVersion) {
    throw new SenaEnterpriseError("The selected revision is already the current project version.", 409, "project_revision_already_current");
  }
  const previousVersion = project.currentVersion;
  project.snapshot = targetRevision.snapshot;
  project.datasetCounts = snapshotCounts(targetRevision.snapshot);
  project.activeWindowLabel = targetRevision.activeWindowLabel;
  project.claimUse = targetRevision.claimUse;
  project.currentVersion += 1;
  project.updatedAt = now();
  const restoredRevision = buildProjectRevision(
    project,
    context.user.id,
    project.currentVersion,
    `Restored from version ${targetRevision.version}: ${targetRevision.summary}`
  );
  db.projectRevisions.push(restoredRevision);
  appendAudit(db, {
    event: "project.restore",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      restoredFromVersion: targetRevision.version,
      restoredToVersion: project.currentVersion,
      previousVersion,
      revisionId: targetRevision.id
    }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectRevisionRestore,
    project,
    restoredFrom: {
      id: targetRevision.id,
      version: targetRevision.version,
      summary: targetRevision.summary
    },
    restoredRevision: {
      id: restoredRevision.id,
      version: restoredRevision.version,
      summary: restoredRevision.summary
    }
  };
}

export function deleteEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:delete");
  const deletedAt = now();
  const deletion = {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectDelete,
    projectId: project.id,
    teamId: project.teamId,
    projectVersion: project.currentVersion,
    deleted: true,
    deletedAt,
    snapshotSha256: artifactSha256(project.snapshot)
  };
  db.projects = db.projects.filter((candidate) => candidate.id !== projectId);
  db.projectRevisions = db.projectRevisions.filter((revision) => revision.projectId !== projectId);
  db.projectComments = db.projectComments.filter((comment) => comment.projectId !== projectId);
  db.projectPresence = db.projectPresence.filter((presence) => presence.projectId !== projectId);
  db.adjudications = db.adjudications.filter((adjudication) => adjudication.projectId !== projectId);
  db.analysisRuns = db.analysisRuns.filter((run) => run.projectId !== projectId && run.persistedProjectId !== projectId);
  db.reliabilityRuns = db.reliabilityRuns.filter((run) => run.projectId !== projectId);
  db.validationRuns = db.validationRuns.filter((run) => run.projectId !== projectId);
  db.expertReviews = db.expertReviews.filter((review) => review.projectId !== projectId);
  appendAudit(db, {
    event: "project.delete",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      projectVersion: project.currentVersion,
      snapshotSha256: deletion.snapshotSha256
    }
  });
  saveDb(db);
  return deletion;
}

function safeUploadName(name: string) {
  const basename = path.basename(name || "upload.bin");
  return basename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload.bin";
}

function uploadExtension(name: string) {
  return path.extname(name).toLowerCase();
}

function scanEnterpriseUploadFile(file: { name: string; contentType?: string; bytes: Buffer }) {
  const originalName = safeUploadName(file.name);
  const extension = uploadExtension(originalName);
  const bytes = Buffer.from(file.bytes);
  const findings: string[] = [];

  if (bytes.byteLength === 0) {
    throw new SenaEnterpriseError("Empty upload files are not accepted.", 400, "upload_empty");
  }
  if (bytes.byteLength > maxUploadBytes) {
    throw new SenaEnterpriseError("Upload exceeds the configured SENA_UPLOAD_MAX_BYTES limit.", 413, "upload_too_large");
  }
  if (!allowedUploadExtensions.has(extension)) {
    throw new SenaEnterpriseError("Upload file type is not allowed for SENA enterprise imports.", 400, "upload_extension_blocked");
  }

  const magic = bytes.subarray(0, 4).toString("hex");
  const executableMagic = magic.startsWith("4d5a") || magic === "7f454c46" || magic === "cafebabe";
  if (executableMagic) {
    throw new SenaEnterpriseError("Upload appears to be executable content and was blocked.", 400, "upload_executable_blocked");
  }
  if (extension === ".xls" && magic.startsWith("d0cf11e0")) {
    findings.push("legacy-office-container-review");
  }

  if (extension === ".csv" || extension === ".json" || extension === ".txt" || extension === ".md" || extension === ".srt" || extension === ".vtt") {
    const preview = bytes.subarray(0, Math.min(bytes.byteLength, 256_000)).toString("utf8");
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(preview)) {
      findings.push("possible-email-addresses");
    }
    if (/\b(?:\+?\d[\d\s().-]{7,}\d)\b/.test(preview)) {
      findings.push("possible-phone-numbers");
    }
    if (/(<script\b|javascript:|powershell|cmd\.exe|\/bin\/sh)/i.test(preview)) {
      findings.push("script-like-text-review");
    }
  }

  return {
    originalName,
    bytes,
    scanStatus: findings.length > 0 ? "review" as const : "passed" as const,
    scanFindings: findings
  };
}

export function createEnterpriseUploads(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  files: Array<{
    name: string;
    contentType?: string;
    bytes: Buffer;
    importProfile?: string;
    warningCount?: number;
  }>;
}) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
  if (input.files.length === 0) return [];
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const uploadDir = path.join(dbDir, "uploads", input.teamId);
  mkdirSync(uploadDir, { recursive: true });
  const timestamp = now();
  const uploads = input.files.map((file) => {
    const uploadId = id("upload");
    const scan = scanEnterpriseUploadFile(file);
    const originalName = scan.originalName;
    const storedName = `${uploadId}-${originalName}`;
    const bytes = scan.bytes;
    const storagePath = path.join("uploads", input.teamId, storedName);
    writeFileSync(path.join(uploadDir, storedName), bytes);
    const upload: SenaEnterpriseUpload = {
      id: uploadId,
      teamId: input.teamId,
      userId: context.user.id,
      originalName,
      storedName,
      contentType: file.contentType?.trim() || "application/octet-stream",
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      importProfile: file.importProfile,
      warningCount: file.warningCount ?? 0,
      scanStatus: scan.scanStatus,
      scanEngine: uploadScanEngine,
      scanFindings: scan.scanFindings,
      storagePath,
      createdAt: timestamp
    };
    db.uploads.push(upload);
    appendAudit(db, {
      event: "upload.create",
      userId: context.user.id,
      teamId: input.teamId,
      detail: {
        uploadId,
        originalName,
        size: upload.size,
        sha256: upload.sha256,
        importProfile: upload.importProfile ?? null,
        scanStatus: upload.scanStatus,
        scanFindings: upload.scanFindings.join("|") || null
      }
    });
    return upload;
  });
  saveDb(db);
  return uploads;
}

export function listEnterpriseUploads(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  const readableTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
    .map((membership) => membership.teamId));
  if (teamId) {
    requireEnterprisePermission(context, teamId, "upload:read");
  }
  return db.uploads
    .filter((upload) => (teamId ? upload.teamId === teamId : readableTeamIds.has(upload.teamId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function uploadBlobAbsolutePath(upload: SenaEnterpriseUpload) {
  const expectedPrefix = path.join("uploads", upload.teamId);
  const normalized = path.normalize(upload.storagePath);
  const insideExpectedPrefix = normalized === expectedPrefix || normalized.startsWith(`${expectedPrefix}${path.sep}`);
  if (path.isAbsolute(normalized) || normalized.startsWith("..") || !insideExpectedPrefix) {
    throw new SenaEnterpriseError("Upload storage path is outside the enterprise upload directory.", 500, "upload_storage_path_invalid");
  }
  return path.join(dbDir, normalized);
}

function listStoredUploadBlobs(teamIds: Set<string>) {
  const blobs: Array<{ teamId: string; storedName: string; storagePath: string; bytes: number }> = [];
  const uploadsRoot = path.join(dbDir, "uploads");
  if (!existsSync(uploadsRoot)) return blobs;
  for (const teamId of teamIds) {
    const teamDir = path.join(uploadsRoot, teamId);
    if (!existsSync(teamDir)) continue;
    for (const storedName of readdirSync(teamDir)) {
      const absolute = path.join(teamDir, storedName);
      const stat = statSync(absolute);
      if (!stat.isFile()) continue;
      blobs.push({
        teamId,
        storedName,
        storagePath: path.join("uploads", teamId, storedName),
        bytes: stat.size
      });
    }
  }
  return blobs;
}

export function verifyEnterpriseUploadStorage(context?: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseUploadStorageVerification {
  const db = readEnterpriseDb();
  let teamIds: Set<string>;
  let mode: SenaEnterpriseUploadStorageVerification["scope"]["mode"] = "system";
  if (context) {
    teamIds = new Set(context.memberships
      .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
      .map((membership) => membership.teamId));
    mode = "all-accessible-teams";
    if (input.teamId) {
      requireEnterprisePermission(context, input.teamId, "upload:read");
      teamIds = new Set([input.teamId]);
      mode = "selected-team";
    }
  } else {
    teamIds = new Set(db.teams.map((team) => team.id));
  }
  const uploads = db.uploads.filter((upload) => teamIds.has(upload.teamId));
  const missing: SenaEnterpriseUploadStorageVerification["missing"] = [];
  const corrupt: SenaEnterpriseUploadStorageVerification["corrupt"] = [];
  let verifiedBlobs = 0;
  let totalVerifiedBytes = 0;
  let totalRegisteredBytes = 0;
  const registeredBlobKeys = new Set<string>();

  for (const upload of uploads) {
    totalRegisteredBytes += upload.size;
    registeredBlobKeys.add(`${upload.teamId}/${upload.storedName}`);
    const absolutePath = uploadBlobAbsolutePath(upload);
    if (!existsSync(absolutePath)) {
      missing.push({ uploadId: upload.id, storagePath: upload.storagePath });
      continue;
    }
    const bytes = readFileSync(absolutePath);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== upload.sha256) {
      corrupt.push({ uploadId: upload.id, storagePath: upload.storagePath, expectedSha256: upload.sha256, actualSha256 });
      continue;
    }
    verifiedBlobs += 1;
    totalVerifiedBytes += bytes.byteLength;
  }

  const orphanBlobs = listStoredUploadBlobs(teamIds)
    .filter((blob) => !registeredBlobKeys.has(`${blob.teamId}/${blob.storedName}`));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadStorageVerification,
    generatedAt: now(),
    status: missing.length === 0 && corrupt.length === 0 && orphanBlobs.length === 0 ? "pass" : "review",
    scope: {
      mode,
      teamIds: Array.from(teamIds).sort()
    },
    storage: {
      engine: "private-local-directory",
      rootHint: path.basename(dbDir)
    },
    summary: {
      registeredUploads: uploads.length,
      verifiedBlobs,
      missingBlobs: missing.length,
      checksumMismatches: corrupt.length,
      orphanBlobs: orphanBlobs.length,
      reviewedUploads: uploads.filter((upload) => upload.scanStatus === "review").length,
      totalRegisteredBytes,
      totalVerifiedBytes
    },
    missing: missing.slice(0, 100),
    corrupt: corrupt.slice(0, 100),
    orphanBlobs: orphanBlobs.slice(0, 100)
  };
}

function objectStorageTeamScope(context: SenaEnterpriseSessionContext, input: { teamId?: string; uploadId?: string }) {
  const db = readEnterpriseDb();
  if (input.uploadId) {
    const upload = db.uploads.find((candidate) => candidate.id === input.uploadId);
    if (!upload) throw new SenaEnterpriseError("Upload was not found.", 404, "upload_not_found");
    if (input.teamId && input.teamId !== upload.teamId) {
      throw new SenaEnterpriseError("Upload does not belong to the requested team.", 400, "upload_team_mismatch");
    }
    requireEnterprisePermission(context, upload.teamId, "team:manage");
    return [upload.teamId];
  }
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
    return [input.teamId];
  }
  const teamIds = manageableTeamIds(context);
  if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for object storage delivery.", 403, "object_storage_permission_denied");
  }
  return teamIds;
}

function uploadObjectStorageKey(upload: SenaEnterpriseUpload) {
  return `teams/${upload.teamId}/uploads/${upload.id}/${upload.storedName}`;
}

function uploadObjectStorageWebhookPayload(
  upload: SenaEnterpriseUpload,
  bytes: Buffer,
  objectKey: string,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageWebhook,
    generatedAt,
    upload: {
      id: upload.id,
      teamId: upload.teamId,
      userId: upload.userId,
      originalName: upload.originalName,
      storedName: upload.storedName,
      contentType: upload.contentType,
      size: upload.size,
      sha256: upload.sha256,
      importProfile: upload.importProfile,
      warningCount: upload.warningCount,
      scanStatus: upload.scanStatus,
      scanEngine: upload.scanEngine,
      scanFindings: upload.scanFindings,
      storagePath: upload.storagePath,
      createdAt: upload.createdAt
    },
    object: {
      key: objectKey,
      encoding: "base64",
      bytesBase64: bytes.toString("base64"),
      sha256: upload.sha256,
      size: bytes.byteLength
    },
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(objectStorageWebhookSecret())
    }
  };
}

async function postUploadObjectStorageWebhook(upload: SenaEnterpriseUpload, bytes: Buffer, objectKey: string) {
  const webhookUrl = objectStorageWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Object storage webhook delivery is not configured.", 503, "object_storage_webhook_not_configured");
  }
  const endpointHash = objectStorageWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(uploadObjectStorageWebhookPayload(upload, bytes, objectKey, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "upload.object_storage.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-upload-id": upload.id,
    "x-sena-upload-sha256": upload.sha256,
    "x-sena-object-key": objectKey
  };
  const secret = objectStorageWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), objectStorageWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function uploadObjectStorageDeliveryStatus(summary: SenaEnterpriseUploadObjectStorageDeliveryResult["summary"]): SenaEnterpriseUploadObjectStorageDeliveryResult["status"] {
  if (summary.failed > 0 && summary.delivered > 0) return "partial";
  if (summary.failed > 0) return "failed";
  return "completed";
}

export async function deliverEnterpriseUploadBlobs(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; uploadId?: string; limit?: number; includeReview?: boolean } = {}
): Promise<SenaEnterpriseUploadObjectStorageDeliveryResult> {
  const provider = objectStorageWebhookProvider();
  const teamIds = objectStorageTeamScope(context, input);
  const teamIdSet = new Set(teamIds);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const includeReview = Boolean(input.includeReview);
  const verification = verifyEnterpriseUploadStorage(context, { teamId: input.teamId ?? (teamIds.length === 1 ? teamIds[0] : undefined) });
  const result: SenaEnterpriseUploadObjectStorageDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageDelivery,
    generatedAt: now(),
    status: provider.configured ? "completed" : "not-configured",
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      requestedUploadId: input.uploadId,
      limit,
      includeReview
    },
    verification,
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pendingReview: 0
    },
    uploads: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const candidates = db.uploads
    .filter((upload) => teamIdSet.has(upload.teamId))
    .filter((upload) => !input.uploadId || upload.id === input.uploadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const targets = candidates.slice(0, limit);
  result.summary.skipped += candidates.length - targets.length;

  for (const upload of targets) {
    const objectKey = uploadObjectStorageKey(upload);
    const baseResult = {
      uploadId: upload.id,
      teamId: upload.teamId,
      originalName: upload.originalName,
      size: upload.size,
      sha256: upload.sha256,
      objectKey,
      scanStatus: upload.scanStatus
    };

    if (upload.scanStatus === "review" && !includeReview) {
      result.summary.skipped += 1;
      result.summary.pendingReview += 1;
      result.uploads.push({
        ...baseResult,
        deliveryStatus: "skipped",
        errorCode: "scan_review_required"
      });
      continue;
    }

    let bytes: Buffer | undefined;
    let localErrorCode: string | undefined;
    let actualSha256: string | undefined;
    try {
      const absolutePath = uploadBlobAbsolutePath(upload);
      if (!existsSync(absolutePath)) {
        localErrorCode = "upload_blob_missing";
      } else {
        bytes = readFileSync(absolutePath);
        actualSha256 = createHash("sha256").update(bytes).digest("hex");
        if (actualSha256 !== upload.sha256) {
          localErrorCode = "upload_checksum_mismatch";
          bytes = undefined;
        }
      }
    } catch (error) {
      localErrorCode = error instanceof SenaEnterpriseError ? error.code : "upload_blob_read_error";
    }

    if (!bytes || localErrorCode) {
      result.summary.failed += 1;
      result.uploads.push({
        ...baseResult,
        deliveryStatus: "failed",
        errorCode: localErrorCode
      });
      appendAudit(db, {
        event: "upload.object_storage.fail",
        userId: context.user.id,
        teamId: upload.teamId,
        detail: {
          uploadId: upload.id,
          objectKey,
          sha256: upload.sha256,
          actualSha256: actualSha256 ?? null,
          errorCode: localErrorCode ?? null,
          endpointHash: provider.endpointHash ?? null
        }
      });
      continue;
    }

    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(provider.endpointHash!)
      : await postUploadObjectStorageWebhook(upload, bytes, objectKey);
    result.summary.attempted += 1;
    if (attemptResult.ok) {
      result.summary.delivered += 1;
    } else {
      result.summary.failed += 1;
    }
    result.uploads.push({
      ...baseResult,
      deliveryStatus: attemptResult.ok ? "delivered" : "failed",
      httpStatus: attemptResult.httpStatus,
      errorCode: attemptResult.errorCode,
      errorHash: attemptResult.errorHash
    });
    appendAudit(db, {
      event: attemptResult.ok ? "upload.object_storage.deliver" : "upload.object_storage.fail",
      userId: context.user.id,
      teamId: upload.teamId,
      detail: {
        uploadId: upload.id,
        objectKey,
        size: upload.size,
        sha256: upload.sha256,
          endpointHash: attemptResult.endpointHash ?? "none",
        httpStatus: attemptResult.httpStatus ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null,
        scanStatus: upload.scanStatus
      }
    });
  }

  result.status = uploadObjectStorageDeliveryStatus(result.summary);
  saveDb(db);
  return result;
}

function datasetCountsFromDataset(dataset: SenaDataset): SenaEnterpriseImportRun["datasetCounts"] {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

export function createEnterpriseImportRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  uploadIds: string[];
  sources: SenaImportAdapterSource[];
  warnings: string[];
  dataset: SenaDataset;
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
}) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const sourceProfiles = Array.from(new Set(input.sources.map((source) => source.profile)));
  const run: SenaEnterpriseImportRun = {
    id: id("import"),
    teamId: input.teamId,
    userId: context.user.id,
    status: input.warnings.length > 0 ? "completed-with-warnings" : "completed",
    fileCount: input.sources.length,
    uploadIds: input.uploadIds,
    sources: input.sources.map((source) => ({
      name: safeUploadName(source.name),
      profile: source.profile,
      rows: source.rows,
      warningCount: source.warnings.length
    })),
    warningCount: input.warnings.length,
    warningsPreview: input.warnings.slice(0, 10),
    cleaningManifest: input.cleaningManifest,
    datasetCounts: datasetCountsFromDataset(input.dataset),
    createdAt: now()
  };
  db.importRuns.unshift(run);
  db.importRuns = db.importRuns.slice(0, 1000);
  appendAudit(db, {
    event: "import.run",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      importRunId: run.id,
      files: run.fileCount,
      people: run.datasetCounts.people,
      utterances: run.datasetCounts.utterances,
      codes: run.datasetCounts.codes,
      warnings: run.warningCount,
      profiles: sourceProfiles.join("|") || "unknown"
    }
  });
  saveDb(db);
  return run;
}

export function listEnterpriseImportRuns(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  const readableTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
    .map((membership) => membership.teamId));
  if (teamId) {
    requireEnterprisePermission(context, teamId, "upload:read");
  }
  return db.importRuns
    .filter((run) => (teamId ? run.teamId === teamId : readableTeamIds.has(run.teamId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createEnterpriseAnalysisRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  projectId?: string;
  persistedProjectId?: string;
  run: SenaAnalysisRunArtifact;
}) {
  requireEnterprisePermission(context, input.teamId, "analysis:run");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  for (const projectId of [input.projectId, input.persistedProjectId].filter(Boolean) as string[]) {
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Analysis run team does not match the project team.", 400, "analysis_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "analysis:run");
  }
  const run: SenaEnterpriseAnalysisRun = {
    id: id("analysis"),
    teamId: input.teamId,
    projectId: input.projectId,
    persistedProjectId: input.persistedProjectId,
    userId: context.user.id,
    sourceKind: input.run.source.kind,
    title: input.run.summary.title,
    includeRuntimeBundle: Boolean(input.run.runtimeBundle),
    datasetCounts: input.run.source.datasetCounts,
    analysisDatasetCounts: input.run.source.analysisDatasetCounts,
    activeTemporalWindow: input.run.source.activeTemporalWindow,
    summary: input.run.summary,
    artifactFingerprints: {
      reportSha256: artifactSha256(input.run.report),
      projectSnapshotSha256: artifactSha256(input.run.projectSnapshot),
      runtimeBundleSha256: input.run.runtimeBundle ? artifactSha256(input.run.runtimeBundle) : undefined
    },
    createdAt: input.run.generatedAt
  };
  db.analysisRuns.unshift(run);
  db.analysisRuns = db.analysisRuns.slice(0, 1000);
  appendAudit(db, {
    event: "analysis.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.persistedProjectId ?? input.projectId,
    detail: {
      analysisRunId: run.id,
      source: run.sourceKind,
      persisted: Boolean(input.persistedProjectId),
      people: run.summary.people,
      codes: run.summary.concepts,
      claimUse: run.summary.claimUse,
      reportSha256: run.artifactFingerprints.reportSha256,
      projectSnapshotSha256: run.artifactFingerprints.projectSnapshotSha256,
      runtimeBundle: run.includeRuntimeBundle
    }
  });
  saveDb(db);
  return run;
}

export function listEnterpriseAnalysisRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("analysis:run"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "analysis:run");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "analysis:run");
    teamIds = new Set([project.teamId]);
  }

  return db.analysisRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId || run.persistedProjectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listEnterpriseTeamState(context: SenaEnterpriseSessionContext) {
  const db = readEnterpriseDb();
  const teamIds = new Set(context.teams.map((team) => team.id));
  return {
    teams: context.teams,
    memberships: db.memberships.filter((membership) => teamIds.has(membership.teamId)),
    users: db.users
      .filter((user) => db.memberships.some((membership) => membership.userId === user.id && teamIds.has(membership.teamId)))
      .map(publicUser),
    invitations: db.invitations.filter((invitation) => teamIds.has(invitation.teamId)),
    uploads: db.uploads.filter((upload) => teamIds.has(upload.teamId)),
    importRuns: db.importRuns.filter((run) => teamIds.has(run.teamId)),
    analysisRuns: db.analysisRuns.filter((run) => teamIds.has(run.teamId)),
    reliabilityRuns: db.reliabilityRuns.filter((run) => teamIds.has(run.teamId)),
    validationRuns: db.validationRuns.filter((run) => teamIds.has(run.teamId)),
    expertReviews: db.expertReviews.filter((review) => teamIds.has(review.teamId)),
    notifications: db.notifications.filter((notification) => !notification.teamId || teamIds.has(notification.teamId)),
    auditLog: db.auditLog.filter((entry) => !entry.teamId || teamIds.has(entry.teamId)).slice(0, 100)
  };
}

export function listEnterpriseNotifications(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseNotificationQuery = {}
): SenaEnterpriseNotificationResult {
  const db = readEnterpriseDb();
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  const filtered = db.notifications
    .filter((notification) => input.teamId ? notification.teamId === input.teamId : notificationVisibleToContext(context, notification))
    .filter((notification) => !input.status || notification.status === input.status)
    .filter((notification) => !input.kind || notification.kind === input.kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notifications = filtered.slice(offset, offset + limit);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotifications,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "team" : "user",
      teamId: input.teamId
    },
    pagination: {
      limit,
      offset,
      total: filtered.length,
      returned: notifications.length,
      nextOffset: offset + notifications.length < filtered.length ? offset + notifications.length : null
    },
    notifications
  };
}

export function markEnterpriseNotificationRead(context: SenaEnterpriseSessionContext, notificationId: string) {
  const db = readEnterpriseDb();
  const notification = db.notifications.find((candidate) => candidate.id === notificationId);
  if (!notification) throw new SenaEnterpriseError("Notification was not found.", 404, "notification_not_found");
  if (!notificationVisibleToContext(context, notification)) {
    throw new SenaEnterpriseError("Notification access is not allowed.", 403, "notification_permission_denied");
  }
  notification.status = "read";
  notification.readAt = now();
  appendAudit(db, {
    event: "notification.read",
    userId: context.user.id,
    teamId: notification.teamId,
    projectId: notification.projectId,
    detail: {
      notificationId: notification.id,
      kind: notification.kind
    }
  });
  saveDb(db);
  return notification;
}

export async function deliverEnterpriseNotifications(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; notificationId?: string } = {}
): Promise<SenaEnterpriseNotificationDeliveryResult> {
  const provider = notificationWebhookProvider();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200);
  const force = Boolean(input.force);
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for notification delivery.", 403, "notification_delivery_permission_denied");
  }

  const result: SenaEnterpriseNotificationDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotificationDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      limit,
      force
    },
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pending: 0
    },
    notifications: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const teamIdSet = new Set(teamIds);
  const deliveryQueue: SenaEnterpriseNotification[] = [];
  const nowMs = Date.now();

  for (const notification of db.notifications
    .filter((candidate) => candidate.teamId && teamIdSet.has(candidate.teamId))
    .filter((candidate) => !input.notificationId || candidate.id === input.notificationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const delivery = ensureNotificationWebhookDelivery(notification);
    if (!delivery) {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.attempts >= delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(notification);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const notification of targets) {
    const delivery = notification.webhookDelivery!;
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(delivery.endpointHash)
      : await postNotificationWebhook(notification, delivery);
    const attemptedAt = now();
    delivery.attempts += 1;
    delivery.lastAttemptAt = attemptedAt;
    delivery.lastStatus = attemptResult.httpStatus;
    delivery.lastErrorCode = attemptResult.errorCode;
    delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      delivery.status = "delivered";
      delivery.deliveredAt = attemptedAt;
      delete delivery.nextAttemptAt;
      delete delivery.failedAt;
      result.summary.delivered += 1;
    } else if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = "failed";
      delivery.failedAt = attemptedAt;
      delete delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      delivery.status = "pending";
      delivery.nextAttemptAt = webhookRetryAt(delivery.attempts);
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.notifications.push({
      notificationId: notification.id,
      kind: notification.kind,
      teamId: notification.teamId,
      projectId: notification.projectId,
      webhookStatus: delivery.status,
      attempts: delivery.attempts,
      httpStatus: delivery.lastStatus,
      errorCode: delivery.lastErrorCode
    });

    appendAudit(db, {
      event: attemptResult.ok ? "notification.webhook.deliver" : "notification.webhook.fail",
      userId: context.user.id,
      teamId: notification.teamId,
      projectId: notification.projectId,
      detail: {
        notificationId: notification.id,
        kind: notification.kind,
        provider: delivery.provider,
        endpointHash: delivery.endpointHash,
        attempts: delivery.attempts,
        status: delivery.status,
        httpStatus: delivery.lastStatus ?? null,
        errorCode: delivery.lastErrorCode ?? null
      }
    });
  }

  saveDb(db);
  return result;
}

export async function deliverEnterpriseEmails(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; emailDeliveryId?: string } = {}
): Promise<SenaEnterpriseEmailDeliveryResult> {
  const provider = emailWebhookProvider();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200);
  const force = Boolean(input.force);
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for email delivery.", 403, "email_delivery_permission_denied");
  }

  const result: SenaEnterpriseEmailDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      limit,
      force
    },
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pending: 0
    },
    emails: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const teamIdSet = new Set(teamIds);
  const deliveryQueue: SenaEnterpriseEmailDelivery[] = [];
  const nowMs = Date.now();

  for (const emailDelivery of (db.emailDeliveries ?? [])
    .filter((candidate) => candidate.teamId && teamIdSet.has(candidate.teamId))
    .filter((candidate) => !input.emailDeliveryId || candidate.id === input.emailDeliveryId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    if (emailDelivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (emailDelivery.endpointHash !== provider.endpointHash) {
      emailDelivery.endpointHash = provider.endpointHash!;
      emailDelivery.status = "pending";
      emailDelivery.attempts = 0;
      delete emailDelivery.nextAttemptAt;
      delete emailDelivery.failedAt;
    }
    emailDelivery.maxAttempts = provider.maxAttempts;
    if (emailDelivery.attempts >= emailDelivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && emailDelivery.nextAttemptAt && Date.parse(emailDelivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(emailDelivery);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const emailDelivery of targets) {
    const attemptedAt = now();
    let attemptResult: { ok: boolean; httpStatus?: number; errorCode?: string; errorHash?: string };
    if (emailDelivery.expiresAt && Date.parse(emailDelivery.expiresAt) <= Date.now()) {
      attemptResult = {
        ok: false,
        httpStatus: undefined,
        errorCode: "expired",
        errorHash: undefined
      };
    } else if (provider.mode === "local-sink") {
      attemptResult = localWebhookSinkAttempt(emailDelivery.endpointHash);
    } else {
      attemptResult = await postEmailWebhook(emailDelivery);
    }

    emailDelivery.attempts += 1;
    emailDelivery.lastAttemptAt = attemptedAt;
    emailDelivery.lastStatus = attemptResult.httpStatus;
    emailDelivery.lastErrorCode = attemptResult.errorCode;
    emailDelivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      emailDelivery.status = "delivered";
      emailDelivery.deliveredAt = attemptedAt;
      delete emailDelivery.nextAttemptAt;
      delete emailDelivery.failedAt;
      result.summary.delivered += 1;
    } else if (emailDelivery.attempts >= emailDelivery.maxAttempts || attemptResult.errorCode === "expired") {
      emailDelivery.status = "failed";
      emailDelivery.failedAt = attemptedAt;
      delete emailDelivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      emailDelivery.status = "pending";
      emailDelivery.nextAttemptAt = webhookRetryAt(emailDelivery.attempts);
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.emails.push({
      emailDeliveryId: emailDelivery.id,
      kind: emailDelivery.kind,
      teamId: emailDelivery.teamId,
      userId: emailDelivery.userId,
      projectId: emailDelivery.projectId,
      emailStatus: emailDelivery.status,
      attempts: emailDelivery.attempts,
      httpStatus: emailDelivery.lastStatus,
      errorCode: emailDelivery.lastErrorCode
    });

    appendAudit(db, {
      event: attemptResult.ok ? "email.webhook.deliver" : "email.webhook.fail",
      userId: context.user.id,
      teamId: emailDelivery.teamId,
      projectId: emailDelivery.projectId,
      detail: {
        emailDeliveryId: emailDelivery.id,
        kind: emailDelivery.kind,
        provider: emailDelivery.provider,
        endpointHash: emailDelivery.endpointHash,
        attempts: emailDelivery.attempts,
        status: emailDelivery.status,
        httpStatus: emailDelivery.lastStatus ?? null,
        errorCode: emailDelivery.lastErrorCode ?? null,
        recipientEmailHash: emailDelivery.recipientEmailHash,
        recipientEmailDomain: emailDelivery.recipientEmailDomain
      }
    });
  }

  saveDb(db);
  return result;
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.teamId);
}

function requiredPlatformDecisionText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for platform decision acceptance.`, 400, "platform_decision_acceptance_required");
  }
  return text;
}

function normalizedPlatformDecisionEvidenceUrl(value?: string) {
  const text = value?.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.href;
  } catch {
    throw new SenaEnterpriseError("Platform decision evidence URL must be HTTP(S).", 400, "invalid_platform_decision_evidence_url");
  }
}

function parseIpv4Octets(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : undefined;
}

function isLocalOrPrivateIdentityEvidenceHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4Octets(host);
  if (ipv4) {
    const [first, second] = ipv4;
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  return host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:");
}

function isReservedIdentityEvidenceHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "test" ||
    host.endsWith(".test") ||
    host === "example" ||
    host.endsWith(".example") ||
    host === "invalid" ||
    host.endsWith(".invalid") ||
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host === "example.net" ||
    host.endsWith(".example.net") ||
    host === "example.org" ||
    host.endsWith(".example.org");
}

function configuredSenaAppOrigin(input: { required?: boolean } = {}) {
  const configured = envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL");
  if (!configured) {
    if (input.required) {
      throw new SenaEnterpriseError(
        "SENA application origin must be configured with SENA_APP_URL or NEXT_PUBLIC_SENA_APP_URL before identity production evidence can be accepted.",
        500,
        "missing_sena_app_origin"
      );
    }
    return undefined;
  }
  try {
    return new URL(configured).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL before identity production evidence can be accepted.", 500, "invalid_sso_app_url");
  }
}

function isIdentityProductionEvidenceEnvironment(environment: string) {
  const tokens = environment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hasProductionToken = tokens.includes("production") || tokens.includes("prod");
  const nonProductionTokens = new Set(["local", "dev", "development", "test", "testing", "staging", "sandbox", "mock", "demo", "preview", "non"]);
  return hasProductionToken && !tokens.some((token) => nonProductionTokens.has(token));
}

function requireIdentityProductionEvidenceEnvironment(
  decisionId: string,
  environment: string,
  productionEvidenceIds: string[]
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (!isIdentityProductionEvidenceEnvironment(environment)) {
    throw new SenaEnterpriseError(
      "Identity production evidence environment must name a production or pilot-production environment before institution IdP or provisioning evidence can be accepted.",
      400,
      "invalid_identity_production_evidence_environment"
    );
  }
}

const identityProductionOwnerRolePolicy: {
  forbiddenTokens: string[];
  institutionOwnerTokens: string[];
  requiredSemanticTokensByDecision: Record<SenaEnterpriseIdentityProductionDecisionId, string[]>;
} = {
  forbiddenTokens: ["sena"],
  institutionOwnerTokens: ["institution", "institutional", "university", "college", "school", "district", "campus", "academy"],
  requiredSemanticTokensByDecision: {
    "institution-idp-approval": ["identity", "idp", "iam", "sso", "oidc", "platform", "security"],
    "institution-provisioning-owner": ["identity", "provisioning", "scim", "idp", "iam", "lifecycle", "platform", "security"]
  }
};

function identityOwnerTextTokens(...values: string[]) {
  return values.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

const genericIdentityProductionOwnerNames = new Set([
  "institution platform owner",
  "institution identity platform owner",
  "institution provisioning platform owner",
  "identity platform owner",
  "provisioning platform owner",
  "platform owner"
]);

function normalizeIdentityProductionOwnerName(ownerName: string) {
  return ownerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGenericIdentityProductionOwnerName(ownerName: string) {
  return genericIdentityProductionOwnerNames.has(normalizeIdentityProductionOwnerName(ownerName));
}

function isInstitutionIdentityPlatformOwnerRole(decisionId: string, ownerName: string, ownerRole: string) {
  if (!isIdentityProductionDecisionId(decisionId)) return true;
  const tokens = identityOwnerTextTokens(ownerName, ownerRole);
  if (tokens.some((token) => identityProductionOwnerRolePolicy.forbiddenTokens.includes(token))) return false;
  const institutionOwnerTokens = new Set(identityProductionOwnerRolePolicy.institutionOwnerTokens);
  if (!tokens.some((token) => institutionOwnerTokens.has(token))) return false;
  const requiredTokens = new Set(identityProductionOwnerRolePolicy.requiredSemanticTokensByDecision[decisionId]);
  return tokens.some((token) => requiredTokens.has(token));
}

function requireIdentityProductionEvidenceOwnerRole(
  decisionId: string,
  ownerName: string,
  ownerRole: string,
  productionEvidenceIds: string[]
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (isGenericIdentityProductionOwnerName(ownerName)) {
    throw new SenaEnterpriseError(
      "Identity production evidence ownerName must name a specific institution identity platform owner, not a generic placeholder owner.",
      400,
      "invalid_identity_production_owner_name"
    );
  }
  if (!isInstitutionIdentityPlatformOwnerRole(decisionId, ownerName, ownerRole)) {
    throw new SenaEnterpriseError(
      "Identity production evidence ownerName and ownerRole must name an institution identity platform owner role under institution ownership, not a local SENA application or non-institution owner.",
      400,
      "invalid_identity_production_owner_role"
    );
  }
}

function requireIdentityProductionEvidenceVerifiedAt(
  decisionId: string,
  productionEvidenceIds: string[],
  productionEvidenceVerifiedAt: string | undefined
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (!productionEvidenceVerifiedAt) {
    throw new SenaEnterpriseError(
      "Identity production evidence verified-at timestamp is required before institution IdP or provisioning production evidence ids can be accepted.",
      400,
      "missing_identity_production_evidence_verified_at"
    );
  }
  const verifiedAtMs = Date.parse(productionEvidenceVerifiedAt);
  if (
    !Number.isFinite(verifiedAtMs) ||
    verifiedAtMs > Date.now() ||
    new Date(verifiedAtMs).toISOString() !== productionEvidenceVerifiedAt
  ) {
    throw new SenaEnterpriseError(
      "Identity production evidence requires a valid past-or-present production evidence verified-at timestamp in canonical ISO format before institution IdP or provisioning production evidence ids can be accepted.",
      400,
      "invalid_identity_production_evidence_verified_at"
    );
  }
}

function normalizeIdentityProductionEvidenceArtifactDigest(
  decisionId: string,
  productionEvidenceIds: string[],
  productionEvidenceArtifactDigest: string | undefined
) {
  const digest = productionEvidenceArtifactDigest?.trim().toLowerCase() || undefined;
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return digest;
  if (!digest) {
    throw new SenaEnterpriseError(
      "Identity production evidence artifact digest is required before institution IdP or provisioning production evidence ids can be accepted.",
      400,
      "missing_identity_production_evidence_artifact_digest"
    );
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new SenaEnterpriseError(
      "Identity production evidence artifact digest must be a SHA-256 hex digest before institution IdP or provisioning production evidence ids can be accepted.",
      400,
      "invalid_identity_production_evidence_artifact_digest"
    );
  }
  return digest;
}

function requireIdentityProductionEvidenceNotes(
  decisionId: string,
  productionEvidenceIds: string[],
  notes: string
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (identityProductionEvidenceNoteSecretCarriers(notes).length > 0) {
    throw new SenaEnterpriseError(
      "Identity production evidence notes must not include raw secret or token values; reference the institution secret store or evidence artifact instead.",
      400,
      "invalid_identity_production_evidence_notes"
    );
  }
}

function requireIdentityProductionEvidenceFreeText(
  decisionId: string,
  productionEvidenceIds: string[],
  fields: Array<{ field: "ownerName" | "ownerRole" | "environment" | "notes"; value: string }>
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (identityProductionEvidenceFreeTextSecretCarriers(fields).length > 0) {
    throw new SenaEnterpriseError(
      "Identity production evidence free-text fields must not include raw secret or token values; reference the institution secret store or evidence artifact instead.",
      400,
      "invalid_identity_production_evidence_free_text"
    );
  }
}

function normalizeIdentityEvidenceAllowedHost(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

function isForbiddenIdentityEvidenceAllowedHost(hostname: string) {
  if (isLocalOrPrivateIdentityEvidenceHost(hostname) || isReservedIdentityEvidenceHost(hostname)) return true;
  const appOrigin = configuredSenaAppOrigin();
  if (!appOrigin) return false;
  return new URL(appOrigin).hostname.toLowerCase().replace(/\.$/, "") === hostname.toLowerCase().replace(/\.$/, "");
}

function identityEvidenceAllowedHostConfig() {
  const configured = envValue("SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");
  if (!configured) return { configured: false, hosts: [], invalidCount: 0 };
  const entries = configured.split(/[,\s]+/).filter(Boolean);
  const hosts: string[] = [];
  let invalidCount = 0;
  for (const entry of entries) {
    const host = normalizeIdentityEvidenceAllowedHost(entry);
    if (host && !isForbiddenIdentityEvidenceAllowedHost(host)) {
      hosts.push(host);
    } else {
      invalidCount += 1;
    }
  }
  return {
    configured: true,
    hosts: Array.from(new Set(hosts)),
    invalidCount
  };
}

function identityEvidenceAllowedHosts() {
  return identityEvidenceAllowedHostConfig().hosts;
}

function normalizedIdentityEvidenceHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function identityEvidenceAllowedHostMatch(hostname: string, allowedHosts = identityEvidenceAllowedHosts()) {
  const host = normalizedIdentityEvidenceHostname(hostname);
  return allowedHosts.find((allowedHost) =>
    host === allowedHost || host.endsWith(`.${allowedHost}`)
  );
}

function identityEvidenceHostAllowed(hostname: string, allowedHosts = identityEvidenceAllowedHosts()) {
  return Boolean(identityEvidenceAllowedHostMatch(hostname, allowedHosts));
}

function identityEvidenceUrlHostHashes(evidenceUrl: string | undefined) {
  if (!evidenceUrl) return {};
  const url = new URL(evidenceUrl);
  const host = normalizedIdentityEvidenceHostname(url.hostname);
  const allowedHost = identityEvidenceAllowedHostMatch(host);
  return {
    evidenceUrlPathHash: sha256Text(url.pathname),
    evidenceUrlHostHash: sha256Text(host),
    ...(allowedHost ? { evidenceUrlAllowedHostHash: sha256Text(allowedHost) } : {})
  };
}

function identityEvidenceUrlHostBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  if (!isIdentityProductionDecisionId(acceptance.decisionId)) return "not-required" as const;
  if (!acceptance.evidenceUrlHash || !acceptance.evidenceUrlHostHash) return "stale" as const;
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  if (!allowedHostConfig.configured) {
    return process.env.NODE_ENV === "production" ? "stale" as const : "current" as const;
  }
  if (allowedHostConfig.hosts.length === 0 || allowedHostConfig.invalidCount > 0) return "stale" as const;
  const allowedHostHashes = new Set(allowedHostConfig.hosts.map((host) => sha256Text(host)).filter(Boolean));
  if (acceptance.evidenceUrlAllowedHostHash && allowedHostHashes.has(acceptance.evidenceUrlAllowedHostHash)) return "current" as const;
  return allowedHostHashes.has(acceptance.evidenceUrlHostHash) ? "current" as const : "stale" as const;
}

function identityEvidenceUrlHostBindingEvidence(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlPathHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  return [
    `evidenceUrlHostBinding=${identityEvidenceUrlHostBindingStatus(acceptance)}`,
    `acceptedEvidenceUrlHash=${acceptance.evidenceUrlHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlPathHash=${acceptance.evidenceUrlPathHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlHostHash=${acceptance.evidenceUrlHostHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlAllowedHostHash=${acceptance.evidenceUrlAllowedHostHash ? "present" : "missing"}`,
    `allowedHostConfig=${allowedHostConfig.configured ? "configured" : "not-configured"}`,
    `allowedHostHashes=${allowedHostConfig.hosts.length}`,
    `invalidAllowedHosts=${allowedHostConfig.invalidCount}`
  ];
}

function identityEvidenceUrlHostBindingCurrent(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  return identityEvidenceUrlHostBindingStatus(acceptance) !== "stale";
}

const identityEvidenceUrlSensitiveQueryParameters = [
  "access_token",
  "api_key",
  "client_secret",
  "code",
  "id_token",
  "key",
  "password",
  "refresh_token",
  "secret",
  "sig",
  "signature",
  "token"
];

function identityEvidenceUrlRejectedSensitiveQueryParameters(url: URL) {
  const rejected = new Set(identityEvidenceUrlSensitiveQueryParameters);
  return Array.from(new Set(Array.from(url.searchParams.keys())
    .map((key) => key.trim().toLowerCase())
    .filter((key) => rejected.has(key))))
    .sort();
}

function identityProductionEvidenceNotesPolicy() {
  return {
    secretValuesRejected: true as const,
    bearerTokensRejected: true as const,
    rejectedSensitiveAssignmentNames: identityEvidenceUrlSensitiveQueryParameters
  };
}

function identityProductionEvidenceFreeTextPolicy() {
  return {
    secretValuesRejected: true as const,
    bearerTokensRejected: true as const,
    fields: ["ownerName", "ownerRole", "environment", "notes"] as Array<"ownerName" | "ownerRole" | "environment" | "notes">,
    rejectedSensitiveAssignmentNames: identityEvidenceUrlSensitiveQueryParameters
  };
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function identityProductionEvidenceNoteSecretCarriers(notes: string) {
  const assignmentNames = identityEvidenceUrlSensitiveQueryParameters.map(escapeRegExpLiteral).join("|");
  const sensitiveAssignment = new RegExp(`\\b(?:${assignmentNames})\\b\\s*(?:=|:)\\s*\\S{8,}`, "i");
  const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i;
  return [
    sensitiveAssignment.test(notes) ? "sensitive-assignment" : null,
    bearerToken.test(notes) ? "bearer-token" : null
  ].filter((item): item is string => Boolean(item));
}

function identityProductionEvidenceFreeTextSecretCarriers(fields: Array<{ field: "ownerName" | "ownerRole" | "environment" | "notes"; value: string }>) {
  return fields
    .filter((field) => identityProductionEvidenceNoteSecretCarriers(field.value).length > 0)
    .map((field) => field.field);
}

function identityEvidenceUrlHasSpecificEvidencePath(url: URL) {
  return url.pathname.split("/").some((segment) => {
    try {
      return decodeURIComponent(segment).trim().length > 0;
    } catch {
      return segment.trim().length > 0;
    }
  });
}

function buildEnterpriseIdentityEvidenceUrlHostBinding(
  latestIdentityAcceptances: Map<string, SenaEnterprisePlatformDecisionAcceptance>
): SenaEnterpriseIdentityEvidenceUrlHostBinding {
  if (isSelfManagedEnterpriseMode()) {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding,
      status: "ready",
      allowedHostConfigStatus: "not-configured",
      allowedHostCount: 0,
      invalidAllowedHostCount: 0,
      current: identityProductionDecisionIds.length,
      stale: 0,
      missing: 0,
      currentDecisionIds: [...identityProductionDecisionIds],
      staleDecisionIds: [],
      missingDecisionIds: [],
      evidence: [
        "schema=sena-enterprise-identity-evidence-url-host-binding/v1",
        "status=ready",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable",
        "evidenceUrlHostBinding=not-required"
      ]
    };
  }
  const currentDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  const staleDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  const missingDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  for (const decisionId of identityProductionDecisionIds) {
    const acceptance = latestIdentityAcceptances.get(decisionId);
    if (!acceptance?.evidenceUrlHash || !acceptance.evidenceUrlHostHash) {
      missingDecisionIds.push(decisionId);
      continue;
    }
    const status = identityEvidenceUrlHostBindingStatus(acceptance);
    if (status === "stale") {
      staleDecisionIds.push(decisionId);
    } else {
      currentDecisionIds.push(decisionId);
    }
  }
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  const allowedHostConfigStatus: SenaEnterpriseIdentityEvidenceUrlHostBinding["allowedHostConfigStatus"] =
    !allowedHostConfig.configured
      ? "not-configured"
      : allowedHostConfig.hosts.length > 0 && allowedHostConfig.invalidCount === 0
        ? "configured"
        : "invalid";
  const status: SenaEnterpriseIdentityEvidenceUrlHostBinding["status"] =
    staleDecisionIds.length > 0 || missingDecisionIds.length > 0 ? "review" : "ready";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding,
    status,
    allowedHostConfigStatus,
    allowedHostCount: allowedHostConfig.hosts.length,
    invalidAllowedHostCount: allowedHostConfig.invalidCount,
    current: currentDecisionIds.length,
    stale: staleDecisionIds.length,
    missing: missingDecisionIds.length,
    currentDecisionIds,
    staleDecisionIds,
    missingDecisionIds,
    evidence: [
      "schema=sena-enterprise-identity-evidence-url-host-binding/v1",
      `status=${status}`,
      `current=${currentDecisionIds.length}`,
      `stale=${staleDecisionIds.length}`,
      `missing=${missingDecisionIds.length}`,
      `staleDecisionIds=${staleDecisionIds.join("|") || "none"}`,
      `missingDecisionIds=${missingDecisionIds.join("|") || "none"}`,
      `allowedHostConfig=${allowedHostConfig.configured ? "configured" : "not-configured"}`,
      `allowedHostHashes=${allowedHostConfig.hosts.length}`,
      `invalidAllowedHosts=${allowedHostConfig.invalidCount}`,
      "redaction=evidence-url-hosts-hashed"
    ]
  };
}

function identityEvidenceUrlPolicy() {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  const allowedHosts = allowedHostConfig.hosts;
  const appOrigin = configuredSenaAppOrigin();
  const evidenceUrlRequiredForEvidenceIds = identityProductionDecisionIds.flatMap((decisionId) =>
    platformDecisionProductionEvidenceIdsByDecision[decisionId] ?? []
  );
  const allowedHostConfigStatus = allowedHostConfig.configured
    ? allowedHosts.length > 0 && allowedHostConfig.invalidCount === 0
      ? "configured" as const
      : "invalid" as const
    : undefined;
  return {
    requiredProtocol: "https" as const,
    institutionOwnedRequired: true as const,
    evidenceUrlRequiredForProductionEvidence: true as const,
    evidenceUrlRequiredForEvidenceIds,
    specificEvidencePathRequired: true as const,
    senaAppOriginRequiredForProductionEvidence: true as const,
    senaAppOriginConfigured: Boolean(appOrigin),
    ...(appOrigin ? { senaAppOriginHash: sha256Text(appOrigin)! } : {}),
    embeddedCredentialsRejected: true as const,
    fragmentsRejected: true as const,
    sensitiveQueryParametersRejected: true as const,
    rejectedSensitiveQueryParameters: identityEvidenceUrlSensitiveQueryParameters,
    allowedHostConfigRequiredInProduction: true as const,
    forbiddenHostKinds: ["local-or-private", "sena-application-origin", "reserved-example-or-test"] as Array<"local-or-private" | "sena-application-origin" | "reserved-example-or-test">,
    ...(allowedHostConfigStatus ? { allowedHostConfigStatus } : {}),
    ...(allowedHostConfig.invalidCount > 0 ? { invalidAllowedHostCount: allowedHostConfig.invalidCount } : {}),
    ...(allowedHosts.length > 0 ? {
      allowedHostCount: allowedHosts.length,
      allowedHostHashes: allowedHosts.map((host) => sha256Text(host)!).sort()
    } : {})
  };
}

function identityEvidenceAllowedHostEvidence() {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  if (!allowedHostConfig.configured) return "not-configured";
  if (allowedHostConfig.hosts.length === 0 || allowedHostConfig.invalidCount > 0) {
    return `invalid:${allowedHostConfig.invalidCount}`;
  }
  return String(allowedHostConfig.hosts.length);
}

function requireIdentityProductionEvidenceUrlSecurity(decisionId: string, evidenceUrl: string | undefined) {
  if (!evidenceUrl || !isIdentityProductionDecisionId(decisionId)) return;
  const url = new URL(evidenceUrl);
  if (url.protocol !== "https:") {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must use HTTPS before it can be attached to institution IdP or provisioning ownership decisions.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  if (url.username || url.password || url.hash) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must not include embedded credentials or URL fragments before it can be attached to institution IdP or provisioning ownership decisions.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  const rejectedSensitiveQueryParameters = identityEvidenceUrlRejectedSensitiveQueryParameters(url);
  if (rejectedSensitiveQueryParameters.length > 0) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must not include sensitive query parameters before it can be attached to institution IdP or provisioning ownership decisions.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  if (!identityEvidenceUrlHasSpecificEvidencePath(url)) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must include a specific evidence path before it can be attached to institution IdP or provisioning ownership decisions.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  if (isLocalOrPrivateIdentityEvidenceHost(url.hostname)) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must reference an institution-owned HTTPS evidence system, not a local or private runtime address.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  const appOrigin = configuredSenaAppOrigin();
  if (appOrigin && url.origin === appOrigin) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must be separate from the SENA application origin so institution IdP or provisioning ownership is not self-attested.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  if (isReservedIdentityEvidenceHost(url.hostname)) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL must reference an institution-owned HTTPS evidence system, not a reserved example or test domain.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  if (process.env.NODE_ENV === "production" && !allowedHostConfig.configured) {
    throw new SenaEnterpriseError(
      "Identity production evidence host allowlist must be configured in production before institution IdP or provisioning evidence can be accepted.",
      400,
      "missing_identity_production_evidence_url_allowlist"
    );
  }
  if (allowedHostConfig.configured && (allowedHostConfig.hosts.length === 0 || allowedHostConfig.invalidCount > 0)) {
    throw new SenaEnterpriseError(
      "Identity production evidence host allowlist must include at least one valid hostname and no malformed entries before institution IdP or provisioning evidence can be accepted.",
      400,
      "invalid_identity_production_evidence_url_allowlist"
    );
  }
  if (allowedHostConfig.hosts.length > 0 && !identityEvidenceHostAllowed(url.hostname, allowedHostConfig.hosts)) {
    throw new SenaEnterpriseError(
      "Identity production evidence URL host must match the configured institution evidence-host allowlist before institution IdP or provisioning evidence can be accepted.",
      400,
      "invalid_identity_production_evidence_url"
    );
  }
}

function requireIdentityProductionEvidenceUrl(decisionId: string, evidenceUrl: string | undefined, productionEvidenceIds: string[]) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (!evidenceUrl) {
    throw new SenaEnterpriseError(
      "Identity production evidence ids require an institution evidence URL before institution IdP or provisioning evidence can be accepted.",
      400,
      "missing_identity_production_evidence_url"
    );
  }
}

function requireIdentityProductionEvidenceAppOrigin(decisionId: string, productionEvidenceIds: string[]) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  configuredSenaAppOrigin({ required: true });
}

const platformDecisionProductionEvidenceIdsByDecision: Record<string, string[]> = {
  "institution-idp-approval": ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
  "institution-provisioning-owner": ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]
};

const identityRotationFreshnessPolicy = {
  get maxAgeDays() {
    return identitySecretRotationMaxAgeDays();
  },
  get warningDays() {
    return identitySecretRotationWarningDays(this.maxAgeDays);
  }
};

const identityRotationFreshnessSpecs: Array<{
  id: "sso-secret-rotation" | "bearer-token-rotation";
  decisionId: SenaEnterpriseIdentityProductionDecisionId;
  label: string;
}> = [
  {
    id: "sso-secret-rotation",
    decisionId: "institution-idp-approval",
    label: "SSO client secret rotation evidence"
  },
  {
    id: "bearer-token-rotation",
    decisionId: "institution-provisioning-owner",
    label: "Provisioning bearer-token rotation evidence"
  }
];

function normalizedProductionEvidenceIds(decisionId: string, values: string[] = []) {
  const normalized = Array.from(new Set(values
    .map((value) => value.trim())
    .filter(Boolean)))
    .slice(0, 50);
  const allowedIds = platformDecisionProductionEvidenceIdsByDecision[decisionId];
  if (allowedIds) {
    const invalid = normalized.filter((value) => !allowedIds.includes(value));
    if (invalid.length > 0) {
      throw new SenaEnterpriseError(
        `Platform decision production evidence ids are not valid for ${decisionId}: ${invalid.join(", ")}.`,
        400,
        "invalid_platform_decision_production_evidence"
      );
    }
  }
  return normalized;
}

function rotationFreshnessCheck(
  spec: typeof identityRotationFreshnessSpecs[number],
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined
): SenaEnterpriseIdentityRotationFreshness["checks"][number] {
  const maxAgeMs = identityRotationFreshnessPolicy.maxAgeDays * 24 * 60 * 60 * 1000;
  const warningMs = identityRotationFreshnessPolicy.warningDays * 24 * 60 * 60 * 1000;
  const hasEvidence = Boolean(
    acceptance?.status === "accepted" &&
    acceptance.acceptedBridge &&
    acceptance.evidenceUrlHash &&
    acceptance.productionEvidenceIds?.includes(spec.id)
  );
  if (!hasEvidence || !acceptance) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      nextAction: `Attach fresh ${spec.label.toLowerCase()} before production release.`
    };
  }
  const verifiedAt = acceptance.productionEvidenceVerifiedAt;
  if (!verifiedAt) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      evidenceUrlHash: acceptance.evidenceUrlHash,
      nextAction: `Attach ${spec.label.toLowerCase()} with a platform production evidence verification timestamp before production release.`
    };
  }
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > Date.now()) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      verifiedAtHash: sha256Text(verifiedAt)!,
      evidenceUrlHash: acceptance.evidenceUrlHash,
      nextAction: `Record a valid past-or-present ISO production evidence verification timestamp for ${spec.label.toLowerCase()} before production release.`
    };
  }
  const ageMs = Math.max(0, Date.now() - verifiedAtMs);
  const expiresAtMs = verifiedAtMs + maxAgeMs;
  const daysUntilExpiry = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
  const status: SenaEnterpriseIdentityRotationFreshness["checks"][number]["status"] = Date.now() >= expiresAtMs
    ? "expired"
    : expiresAtMs - Date.now() <= warningMs
      ? "due-soon"
      : "ready";
  return {
    id: spec.id,
    decisionId: spec.decisionId,
    label: spec.label,
    status,
    maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
    warningDays: identityRotationFreshnessPolicy.warningDays,
    ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
    daysUntilExpiry,
    verifiedAtHash: sha256Text(verifiedAt)!,
    expiresAtHash: sha256Text(new Date(expiresAtMs).toISOString())!,
    evidenceUrlHash: acceptance.evidenceUrlHash,
    nextAction: status === "expired"
      ? `Refresh ${spec.label.toLowerCase()} and record a new platform decision acceptance.`
      : status === "due-soon"
        ? `Schedule ${spec.label.toLowerCase()} renewal before the current rotation evidence expires.`
        : `Keep ${spec.label.toLowerCase()} attached to release checks.`
  };
}

function buildEnterpriseIdentityRotationFreshness(
  acceptances: Map<string, SenaEnterprisePlatformDecisionAcceptance>,
  generatedAt: string = now()
): SenaEnterpriseIdentityRotationFreshness {
  if (isSelfManagedEnterpriseMode()) {
    const checks: SenaEnterpriseIdentityRotationFreshness["checks"] = identityRotationFreshnessSpecs.map((spec) => ({
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "ready",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: identityRotationFreshnessPolicy.maxAgeDays,
      nextAction: "Institution identity secret rotation evidence is not applicable in self-managed enterprise mode; rotate local secrets through the self-managed runbook."
    }));
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
      generatedAt,
      status: "ready",
      policy: identityRotationFreshnessPolicy,
      summary: {
        checks: checks.length,
        ready: checks.length,
        dueSoon: 0,
        expired: 0,
        missing: 0
      },
      checks,
      evidence: [
        "schema=sena-enterprise-identity-rotation-freshness/v1",
        "status=ready",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable",
        "missing=none"
      ],
      nextActions: []
    };
  }
  const checks = identityRotationFreshnessSpecs.map((spec) => rotationFreshnessCheck(spec, acceptances.get(spec.decisionId)));
  const expired = checks.filter((check) => check.status === "expired").length;
  const missing = checks.filter((check) => check.status === "missing").length;
  const dueSoon = checks.filter((check) => check.status === "due-soon").length;
  const ready = checks.filter((check) => check.status === "ready").length;
  const status: SenaEnterpriseIdentityRotationFreshness["status"] = expired > 0 || missing > 0 ? "review" : "ready";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
    generatedAt,
    status,
    policy: identityRotationFreshnessPolicy,
    summary: {
      checks: checks.length,
      ready,
      dueSoon,
      expired,
      missing
    },
    checks,
    evidence: [
      "schema=sena-enterprise-identity-rotation-freshness/v1",
      `status=${status}`,
      `maxAgeDays=${identityRotationFreshnessPolicy.maxAgeDays}`,
      `warningDays=${identityRotationFreshnessPolicy.warningDays}`,
      `expired=${checks.filter((check) => check.status === "expired").map((check) => check.id).join("|") || "none"}`,
      `dueSoon=${checks.filter((check) => check.status === "due-soon").map((check) => check.id).join("|") || "none"}`,
      `missing=${checks.filter((check) => check.status === "missing").map((check) => check.id).join("|") || "none"}`
    ],
    nextActions: Array.from(new Set(checks
      .filter((check) => check.status !== "ready")
      .map((check) => check.nextAction)))
  };
}

function platformDecisionProductionEvidenceFresh(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  evidenceId: string
) {
  const requiresProductionEvidenceTimestamp = acceptance
    ? platformDecisionProductionEvidenceIdsByDecision[acceptance.decisionId]?.includes(evidenceId) === true
    : false;
  if (acceptance && requiresProductionEvidenceTimestamp) {
    const verifiedAtMs = Date.parse(acceptance.productionEvidenceVerifiedAt ?? "");
    if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > Date.now()) return false;
  }
  const rotationSpec = identityRotationFreshnessSpecs.find((spec) => spec.id === evidenceId);
  if (!rotationSpec) return true;
  const check = rotationFreshnessCheck(rotationSpec, acceptance);
  return check.status === "ready" || check.status === "due-soon";
}

function identityRequestPacketPolicyAnchor() {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket,
    submission: {
      method: "POST" as const,
      path: "/api/sena/ops/platform-decisions" as const,
      responseSchema: "sena-enterprise-platform-decision-production-evidence-receipt/v1" as const,
      responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
      receiptArchivePolicy: identityPlatformDecisionReceiptArchivePolicy,
      requiredAcceptedStatus: "accepted" as const,
      requiredAcceptedBridge: true as const,
      requiredBodyFields: identityPlatformDecisionSubmissionRequiredBodyFields,
      identityProductionEvidenceBodyFields: identityProductionEvidenceSubmissionBodyFields,
      productionEvidenceArtifactDigestPolicy: identityProductionEvidenceArtifactDigestSubmissionPolicy(),
      evidenceUrlPolicy: identityEvidenceUrlPolicy(),
      ownerRolePolicy: identityProductionOwnerRolePolicy,
      notesPolicy: identityProductionEvidenceNotesPolicy(),
      freeTextPolicy: identityProductionEvidenceFreeTextPolicy()
    },
    productionEvidenceIdsByDecision: Object.fromEntries(identityProductionDecisionIds.map((decisionId) => [
      decisionId,
      platformDecisionProductionEvidenceIdsByDecision[decisionId] ?? []
    ])),
    productionEvidenceVerifiedAtPolicy: {
      required: true as const,
      validPastOrPresentRequired: true as const,
      futureTimestampsRejected: true as const,
      canonicalIsoTimestampRequired: true as const
    },
    rotationFreshnessPolicy: {
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      rotationEvidenceIds: identityRotationFreshnessSpecs.map((spec) => spec.id)
    }
  };
}

function identityRequestPacketPolicyHash() {
  return artifactSha256(identityRequestPacketPolicyAnchor());
}

function normalizeSubmittedIdentityRequestPacketPolicyHash(
  decisionId: string,
  productionEvidenceIds: string[],
  submittedRequestPacketPolicyHash: string | undefined,
  required = false
) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return undefined;
  const submitted = submittedRequestPacketPolicyHash?.trim().toLowerCase();
  if (!submitted) {
    if (required) {
      throw new SenaEnterpriseError(
        "Identity production evidence submissions must include the current identity request packet policy hash before institution IdP or provisioning evidence can be accepted.",
        400,
        "missing_identity_request_packet_policy_hash"
      );
    }
    return undefined;
  }
  if (!/^[a-f0-9]{64}$/.test(submitted) || submitted !== identityRequestPacketPolicyHash()) {
    throw new SenaEnterpriseError(
      "Identity production evidence submissions must echo the current identity request packet policy hash before institution IdP or provisioning evidence can be accepted.",
      400,
      "stale_identity_request_packet_policy_hash"
    );
  }
  return submitted;
}

function identityRequestPacketPolicyBinding(acceptance: Pick<
  SenaEnterprisePlatformDecisionAcceptance,
  "decisionId" | "submittedRequestPacketPolicyHash" | "productionEvidenceReceipt"
>): {
  requestPacketPolicyHash?: string;
  submittedRequestPacketPolicyHash?: string;
  status: "current" | "stale" | "not-required";
  evidence: string[];
} {
  if (!isIdentityProductionDecisionId(acceptance.decisionId)) {
    return {
      status: "not-required" as const,
      evidence: ["requestPacketPolicyBinding=not-required"]
    };
  }
  const requestPacketPolicyHash = identityRequestPacketPolicyHash();
  const submittedRequestPacketPolicyHash =
    acceptance.submittedRequestPacketPolicyHash ??
    acceptance.productionEvidenceReceipt?.submittedRequestPacketPolicyHash;
  const status = !submittedRequestPacketPolicyHash || submittedRequestPacketPolicyHash !== requestPacketPolicyHash
    ? "stale" as const
    : "current" as const;
  return {
    requestPacketPolicyHash,
    ...(submittedRequestPacketPolicyHash ? { submittedRequestPacketPolicyHash } : {}),
    status,
    evidence: [
      `requestPacketPolicyBinding=${status}`,
      `requestPacketPolicyHash=${requestPacketPolicyHash}`,
      `submittedRequestPacketPolicyHash=${submittedRequestPacketPolicyHash ? "present" : "missing"}`,
      `requestPacketPolicySchema=sena-enterprise-identity-platform-decision-request-packet/v1`,
      `requestPacketPolicyRequiredBodyFields=${identityPlatformDecisionSubmissionRequiredBodyFields.join("|")}`,
      `requestPacketPolicyIdentityFields=${identityProductionEvidenceSubmissionBodyFields.join("|")}`,
      `requestPacketPolicyEvidenceUrlAllowedHosts=${identityEvidenceAllowedHostEvidence()}`
    ]
  };
}

function missingPlatformDecisionAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance) {
  if (acceptance.status !== "accepted" || !acceptance.acceptedBridge) return [];
  if (acceptance.decisionId === "institution-idp-approval") {
    const evidence = idpAcceptanceEvidence(acceptance);
    return [
      evidence.tenant && evidence.evidenceUrl ? null : "idp-tenant-approval",
      evidence.callback && evidence.evidenceUrl ? null : "idp-callback-approval",
      evidence.providerSecrets && evidence.evidenceUrl ? null : "sso-provider-secrets",
      evidence.secretStoreReference && evidence.evidenceUrl ? null : "sso-secret-store-reference",
      evidence.secretRotation && evidence.evidenceUrl ? null : "sso-secret-rotation"
    ].filter((item): item is string => Boolean(item));
  }
  if (acceptance.decisionId === "institution-provisioning-owner") {
    const evidence = provisioningOwnerAcceptanceEvidence(acceptance);
    return [
      evidence.owner && evidence.evidenceUrl ? null : "provisioning-owner",
      evidence.scimOrIdp && evidence.evidenceUrl ? null : "scim-or-idp-ownership",
      evidence.bearerTokenRotation && evidence.evidenceUrl ? null : "bearer-token-rotation",
      evidence.lifecycleGuardrails && evidence.evidenceUrl ? null : "lifecycle-guardrails"
    ].filter((item): item is string => Boolean(item));
  }
  return [];
}

function stableTechnicalEvidenceBindingDigestInput(
  binding: SenaEnterpriseIdentityTechnicalEvidenceBinding | undefined
) {
  if (!binding) return undefined;
  return {
    schemaVersion: binding.schemaVersion,
    decisionId: binding.decisionId,
    provider: binding.provider,
    status: binding.status,
    secretBinding: binding.secretBinding,
    secretVersionBinding: binding.secretVersionBinding,
    secretStoreReferenceBinding: binding.secretStoreReferenceBinding,
    secretRotationCadenceBinding: binding.secretRotationCadenceBinding,
    idpTenantBinding: binding.idpTenantBinding,
    lifecycleOwnerModeBinding: binding.lifecycleOwnerModeBinding,
    latestPreflightAtHash: binding.latestPreflightAt ? sha256Text(binding.latestPreflightAt) : undefined,
    latestPreflightStatus: binding.latestPreflightStatus,
    configBinding: binding.configBinding,
    configHashes: binding.configHashes
  };
}

function platformDecisionProductionEvidenceReceipt(
  acceptance: Pick<
    SenaEnterprisePlatformDecisionAcceptance,
    "decisionId" | "status" | "acceptedBridge" | "ownerName" | "ownerRole" | "environment" | "evidenceUrl" | "evidenceUrlHash" | "evidenceUrlPathHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash" | "productionEvidenceIds" | "productionEvidenceArtifactDigest" | "productionEvidenceVerifiedAt" | "submittedRequestPacketPolicyHash" | "technicalEvidenceBinding" | "productionEvidenceReceipt" | "notes" | "updatedAt"
  >
): SenaEnterprisePlatformDecisionProductionEvidenceReceipt | undefined {
  const allowedEvidenceIds = platformDecisionProductionEvidenceIdsByDecision[acceptance.decisionId];
  if (!allowedEvidenceIds) return undefined;
  const canAcceptProductionEvidence = acceptance.status === "accepted" && acceptance.acceptedBridge;
  const missingEvidenceIds = canAcceptProductionEvidence
    ? missingPlatformDecisionAcceptanceEvidence(acceptance as SenaEnterprisePlatformDecisionAcceptance)
    : allowedEvidenceIds;
  const missingEvidenceIdSet = new Set(missingEvidenceIds);
  const submittedEvidenceIds = canAcceptProductionEvidence ? acceptance.productionEvidenceIds ?? [] : [];
  const acceptedEvidenceIds = allowedEvidenceIds.filter((evidenceId) => !missingEvidenceIdSet.has(evidenceId));
  const unexpectedEvidenceIds = submittedEvidenceIds.filter((evidenceId) => !allowedEvidenceIds.includes(evidenceId));
  const identityRequestPacketSchemaVersion = isIdentityProductionDecisionId(acceptance.decisionId)
    ? "sena-enterprise-identity-platform-decision-request-packet/v1"
    : undefined;
  const technicalBindingStatus = identityTechnicalEvidenceBindingStatus(acceptance);
  const technicalReadinessStatus = identityRequestPacketSchemaVersion
    ? identityTechnicalReadinessStatus(acceptance)
    : undefined;
  const evidenceUrlHostBindingStatus = identityRequestPacketSchemaVersion
    ? identityEvidenceUrlHostBindingStatus(acceptance)
    : undefined;
  const requestPacketPolicyBinding = identityRequestPacketPolicyBinding(acceptance);
  const rotationFreshnessChecks = identityRequestPacketSchemaVersion
    ? identityRotationFreshnessSpecs
      .filter((spec) => spec.decisionId === acceptance.decisionId)
      .map((spec) => rotationFreshnessCheck(spec, acceptance as SenaEnterprisePlatformDecisionAcceptance))
    : [];
  const rotationExpiredEvidenceIds = rotationFreshnessChecks
    .filter((check) => check.status === "expired")
    .map((check) => check.id);
  const rotationDueSoonEvidenceIds = rotationFreshnessChecks
    .filter((check) => check.status === "due-soon")
    .map((check) => check.id);
  const rotationFreshnessStatus: SenaEnterpriseIdentityRotationFreshness["status"] = rotationFreshnessChecks
    .some((check) => check.status === "expired" || check.status === "missing")
    ? "review"
    : "ready";
  const verifierStatus = canAcceptProductionEvidence &&
    missingEvidenceIds.length === 0 &&
    (!identityRequestPacketSchemaVersion || (
      technicalBindingStatus === "current" &&
      technicalReadinessStatus === "ready" &&
      evidenceUrlHostBindingStatus === "current" &&
      requestPacketPolicyBinding.status === "current"
    ))
    ? "ready" as const
    : "review" as const;
  const productionEvidenceArtifactDigestCompletenessStatus = identityProductionEvidenceArtifactCompletenessStatus(
    allowedEvidenceIds,
    submittedEvidenceIds,
    Boolean(acceptance.productionEvidenceArtifactDigest)
  );
  const receiptCore: Omit<
    SenaEnterprisePlatformDecisionProductionEvidenceReceipt,
    "receiptAuditDigestAlgorithm" |
    "receiptAuditDigestScope" |
    "receiptAuditDigest" |
    "submittedEvidenceDigestAlgorithm" |
    "submittedEvidenceDigestScope" |
    "submittedEvidenceDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionProductionEvidenceReceipt,
    decisionId: acceptance.decisionId,
    ...(identityRequestPacketSchemaVersion ? { ownerNameHash: sha256Text(acceptance.ownerName) } : {}),
    ...(identityRequestPacketSchemaVersion && acceptance.productionEvidenceVerifiedAt ? {
      productionEvidenceVerifiedAtHash: sha256Text(acceptance.productionEvidenceVerifiedAt)
    } : {}),
    allowedEvidenceIds,
    submittedEvidenceIds,
    acceptedEvidenceIds,
    missingEvidenceIds,
    ...(identityRequestPacketSchemaVersion ? {
      requestPacketSchemaVersion: identityRequestPacketSchemaVersion,
      responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
      receiptArchiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
      requestPacketPolicyHash: requestPacketPolicyBinding.requestPacketPolicyHash,
      ...(requestPacketPolicyBinding.submittedRequestPacketPolicyHash ? {
        submittedRequestPacketPolicyHash: requestPacketPolicyBinding.submittedRequestPacketPolicyHash
      } : {}),
      requestPacketPolicyBindingStatus: requestPacketPolicyBinding.status,
      requestPacketPolicyEvidence: requestPacketPolicyBinding.evidence,
      verifierStatus,
      expectedEvidenceIds: allowedEvidenceIds,
      matchedRequestEvidenceIds: acceptedEvidenceIds,
      unexpectedEvidenceIds,
      stillMissingEvidenceIds: missingEvidenceIds,
      technicalBindingStatus,
      technicalReadinessStatus,
      technicalBindingEvidence: identityTechnicalEvidenceBindingEvidence(acceptance),
      evidenceUrlHostBindingStatus,
      evidenceUrlHostBindingEvidence: identityEvidenceUrlHostBindingEvidence(acceptance),
      rotationFreshnessStatus,
      rotationFreshnessChecks,
      rotationExpiredEvidenceIds,
      rotationDueSoonEvidenceIds
    } : {}),
    evidenceUrlHash: acceptance.evidenceUrlHash,
    ...(acceptance.evidenceUrlPathHash ? { evidenceUrlPathHash: acceptance.evidenceUrlPathHash } : {}),
    ...(acceptance.evidenceUrlHostHash ? { evidenceUrlHostHash: acceptance.evidenceUrlHostHash } : {}),
    ...(acceptance.evidenceUrlAllowedHostHash ? { evidenceUrlAllowedHostHash: acceptance.evidenceUrlAllowedHostHash } : {}),
    ...(acceptance.productionEvidenceArtifactDigest ? {
      productionEvidenceArtifactDigestAlgorithm: "sha256",
      productionEvidenceArtifactDigestScope: identityProductionEvidenceArtifactDigestScope,
      productionEvidenceArtifactDigest: acceptance.productionEvidenceArtifactDigest,
      productionEvidenceArtifactDigestCoveredEvidenceIds: submittedEvidenceIds,
      productionEvidenceArtifactDigestCoverageStatus: "covered" as const,
      productionEvidenceArtifactDigestCompletenessStatus
    } : {})
  };
  const submittedEvidenceDigest = artifactSha256({
    schemaVersion: receiptCore.schemaVersion,
    submittedEvidenceDigestAlgorithm: "sha256",
    submittedEvidenceDigestScope: identitySubmittedEvidenceDigestScope,
    decisionId: receiptCore.decisionId,
    status: acceptance.status,
    acceptedBridge: acceptance.acceptedBridge,
    ownerNameHash: receiptCore.ownerNameHash,
    ...(identityRequestPacketSchemaVersion ? { ownerRoleHash: sha256Text(acceptance.ownerRole) } : {}),
    ...(identityRequestPacketSchemaVersion ? { environmentHash: sha256Text(acceptance.environment) } : {}),
    productionEvidenceVerifiedAtHash: receiptCore.productionEvidenceVerifiedAtHash,
    submittedEvidenceIds: receiptCore.submittedEvidenceIds,
    evidenceUrlHash: receiptCore.evidenceUrlHash,
    evidenceUrlPathHash: receiptCore.evidenceUrlPathHash,
    evidenceUrlHostHash: receiptCore.evidenceUrlHostHash,
    evidenceUrlAllowedHostHash: receiptCore.evidenceUrlAllowedHostHash,
    ...(receiptCore.productionEvidenceArtifactDigest ? {
      productionEvidenceArtifactDigestAlgorithm: receiptCore.productionEvidenceArtifactDigestAlgorithm,
      productionEvidenceArtifactDigestScope: receiptCore.productionEvidenceArtifactDigestScope,
      productionEvidenceArtifactDigest: receiptCore.productionEvidenceArtifactDigest,
      productionEvidenceArtifactDigestCoveredEvidenceIds: receiptCore.productionEvidenceArtifactDigestCoveredEvidenceIds,
      productionEvidenceArtifactDigestCoverageStatus: receiptCore.productionEvidenceArtifactDigestCoverageStatus,
      productionEvidenceArtifactDigestCompletenessStatus: receiptCore.productionEvidenceArtifactDigestCompletenessStatus
    } : {}),
    requestPacketSchemaVersion: receiptCore.requestPacketSchemaVersion,
    submittedRequestPacketPolicyHash: receiptCore.submittedRequestPacketPolicyHash,
    technicalEvidenceBinding: stableTechnicalEvidenceBindingDigestInput(acceptance.technicalEvidenceBinding)
  });
  return {
    ...receiptCore,
    receiptAuditDigestAlgorithm: "sha256",
    receiptAuditDigestScope: identityReceiptAuditDigestScope,
    receiptAuditDigest: artifactSha256({
      ...receiptCore,
      receiptAuditDigestAlgorithm: "sha256",
      receiptAuditDigestScope: identityReceiptAuditDigestScope
    }),
    submittedEvidenceDigestAlgorithm: "sha256",
    submittedEvidenceDigestScope: identitySubmittedEvidenceDigestScope,
    submittedEvidenceDigest
  };
}

function summarizePlatformDecisionAcceptances(
  acceptances: SenaEnterprisePlatformDecisionAcceptance[]
): SenaEnterprisePlatformDecisionAcceptanceList["summary"] {
  const latestAcceptances = Array.from(latestPlatformDecisionAcceptances(acceptances).values());
  return {
    total: acceptances.length,
    accepted: acceptances.filter((acceptance) => acceptance.status === "accepted").length,
    rejected: acceptances.filter((acceptance) => acceptance.status === "rejected").length,
    needsNativeAdapter: acceptances.filter((acceptance) => acceptance.status === "needs-native-adapter").length,
    superseded: acceptances.filter((acceptance) => acceptance.status === "superseded").length,
    acceptedBridge: acceptances.filter((acceptance) => acceptance.status === "accepted" && acceptance.acceptedBridge).length,
    acceptedBridgeMissingEvidence: latestAcceptances.filter((acceptance) =>
      missingPlatformDecisionAcceptanceEvidence(acceptance).length > 0
    ).length
  };
}

export function reviewEnterprisePlatformDecision(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePlatformDecisionAcceptanceInput
): SenaEnterprisePlatformDecisionAcceptance {
  if (!isEnterprisePlatformDecisionId(input.decisionId)) {
    throw new SenaEnterpriseError("Platform decision id is not recognized.", 400, "unknown_platform_decision");
  }
  if (!isEnterprisePlatformDecisionAcceptanceStatus(input.status)) {
    throw new SenaEnterpriseError("Platform decision acceptance status is not recognized.", 400, "invalid_platform_decision_status");
  }
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const evidenceUrl = normalizedPlatformDecisionEvidenceUrl(input.evidenceUrl);
  requireIdentityProductionEvidenceUrlSecurity(input.decisionId, evidenceUrl);
  const productionEvidenceIds = input.status === "accepted"
    ? normalizedProductionEvidenceIds(input.decisionId, input.productionEvidenceIds)
    : [];
  const submittedRequestPacketPolicyHash = normalizeSubmittedIdentityRequestPacketPolicyHash(
    input.decisionId,
    productionEvidenceIds,
    input.requestPacketPolicyHash,
    input.requireRequestPacketPolicyHash ?? envValue("NODE_ENV") === "production"
  );
  if (isIdentityProductionDecisionId(input.decisionId) && productionEvidenceIds.length > 0 && !input.acceptedBridge) {
    throw new SenaEnterpriseError(
      "Identity production evidence ids require acceptedBridge=true so institution IdP or provisioning evidence cannot be attached to an unaccepted platform bridge.",
      400,
      "identity_production_evidence_requires_accepted_bridge"
    );
  }
  requireIdentityProductionEvidenceUrl(input.decisionId, evidenceUrl, productionEvidenceIds);
  requireIdentityProductionEvidenceAppOrigin(input.decisionId, productionEvidenceIds);
  const environment = requiredPlatformDecisionText(input.environment, "environment");
  const ownerName = requiredPlatformDecisionText(input.ownerName, "ownerName");
  const ownerRole = requiredPlatformDecisionText(input.ownerRole, "ownerRole");
  const notes = requiredPlatformDecisionText(input.notes, "notes");
  const productionEvidenceVerifiedAt = input.productionEvidenceVerifiedAt?.trim() || undefined;
  const productionEvidenceArtifactDigest = normalizeIdentityProductionEvidenceArtifactDigest(
    input.decisionId,
    productionEvidenceIds,
    input.productionEvidenceArtifactDigest
  );
  requireIdentityProductionEvidenceEnvironment(input.decisionId, environment, productionEvidenceIds);
  requireIdentityProductionEvidenceNotes(input.decisionId, productionEvidenceIds, notes);
  requireIdentityProductionEvidenceFreeText(input.decisionId, productionEvidenceIds, [
    { field: "ownerName", value: ownerName },
    { field: "ownerRole", value: ownerRole },
    { field: "environment", value: environment },
    { field: "notes", value: notes }
  ]);
  requireIdentityProductionEvidenceOwnerRole(input.decisionId, ownerName, ownerRole, productionEvidenceIds);
  requireIdentityProductionEvidenceVerifiedAt(input.decisionId, productionEvidenceIds, productionEvidenceVerifiedAt);
  const timestamp = now();
  const evidenceUrlHash = sha256Text(evidenceUrl);
  const evidenceUrlHostHashes = isIdentityProductionDecisionId(input.decisionId)
    ? identityEvidenceUrlHostHashes(evidenceUrl)
    : {};
  const db = readEnterpriseDb();
  const technicalEvidenceBinding = input.status === "accepted"
    ? buildEnterpriseIdentityTechnicalEvidenceBinding(input.decisionId, db)
    : undefined;
  const acceptance: SenaEnterprisePlatformDecisionAcceptance = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptance,
    id: id("platform-decision"),
    teamId: input.teamId,
    decisionId: input.decisionId,
    status: input.status,
    acceptedBridge: input.status === "accepted" ? Boolean(input.acceptedBridge) : false,
    ownerName,
    ownerRole,
    environment,
    evidenceUrlHash,
    ...evidenceUrlHostHashes,
    productionEvidenceIds,
    ...(productionEvidenceArtifactDigest ? { productionEvidenceArtifactDigest } : {}),
    ...(productionEvidenceVerifiedAt ? { productionEvidenceVerifiedAt } : {}),
    ...(submittedRequestPacketPolicyHash ? { submittedRequestPacketPolicyHash } : {}),
    ...(technicalEvidenceBinding ? { technicalEvidenceBinding } : {}),
    notes,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  acceptance.productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance);
  db.platformDecisionAcceptances.unshift(acceptance);
  const productionEvidenceReceipt = acceptance.productionEvidenceReceipt;
  appendAudit(db, {
    event: "ops.platform_decision.review",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      decisionId: acceptance.decisionId,
      status: acceptance.status,
      acceptedBridge: acceptance.acceptedBridge,
      ownerRole: acceptance.ownerRole,
      environment: acceptance.environment,
      productionEvidenceIds: acceptance.productionEvidenceIds?.join("|") || null,
      productionEvidenceArtifactDigest: acceptance.productionEvidenceArtifactDigest ? "present" : null,
      identityRequestPacketPolicyHash: acceptance.submittedRequestPacketPolicyHash ? "present" : null,
      identityReceiptAuditDigest: productionEvidenceReceipt?.receiptAuditDigest ?? null,
      identitySubmittedEvidenceDigest: productionEvidenceReceipt?.submittedEvidenceDigest ?? null,
      identitySubmittedEvidenceDigestScope: productionEvidenceReceipt?.submittedEvidenceDigestScope ?? null,
      identityProductionEvidenceArtifactDigest: productionEvidenceReceipt?.productionEvidenceArtifactDigest ?? null,
      identityProductionEvidenceArtifactCoverage: productionEvidenceReceipt?.productionEvidenceArtifactDigestCoverageStatus ?? null,
      identityProductionEvidenceArtifactCompleteness: productionEvidenceReceipt?.productionEvidenceArtifactDigestCompletenessStatus ?? null,
      identityVerifierStatus: productionEvidenceReceipt?.verifierStatus ?? null,
      identityRequestPacketPolicyBindingStatus: productionEvidenceReceipt?.requestPacketPolicyBindingStatus ?? null,
      identityTechnicalBindingStatus: productionEvidenceReceipt?.technicalBindingStatus ?? null,
      identityTechnicalReadinessStatus: productionEvidenceReceipt?.technicalReadinessStatus ?? null,
      identityEvidenceUrlHostBindingStatus: productionEvidenceReceipt?.evidenceUrlHostBindingStatus ?? null,
      missingProductionEvidenceIds: productionEvidenceReceipt?.missingEvidenceIds.join("|") || null,
      identityRotationFreshness: productionEvidenceReceipt?.rotationFreshnessStatus ?? null,
      identityRotationExpiredEvidenceIds: productionEvidenceReceipt?.rotationExpiredEvidenceIds?.join("|") || "none",
      identityRotationDueSoonEvidenceIds: productionEvidenceReceipt?.rotationDueSoonEvidenceIds?.join("|") || "none",
      evidenceUrlHash: acceptance.evidenceUrlHash ?? null,
      evidenceUrlPathHash: acceptance.evidenceUrlPathHash ?? null
    }
  });
  saveDb(db);
  return acceptance;
}

function redactEnterprisePlatformDecisionAcceptance(
  acceptance: SenaEnterprisePlatformDecisionAcceptance
): SenaEnterprisePlatformDecisionAcceptance {
  const { evidenceUrl: _evidenceUrl, ...redacted } = acceptance;
  return {
    ...redacted,
    productionEvidenceReceipt: platformDecisionProductionEvidenceReceipt(acceptance) ?? acceptance.productionEvidenceReceipt
  };
}

export function listEnterprisePlatformDecisionAcceptances(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterprisePlatformDecisionAcceptanceList {
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for platform decision acceptances.", 403, "platform_decision_permission_denied");
  }
  const teamIdSet = new Set(teamIds);
  const acceptances = (readEnterpriseDb().platformDecisionAcceptances ?? [])
    .filter((acceptance) => teamIdSet.has(acceptance.teamId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(redactEnterprisePlatformDecisionAcceptance);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptances,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizePlatformDecisionAcceptances(acceptances),
    acceptances
  };
}

function requiredReleaseGateText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for release gate review.`, 400, "release_gate_review_required");
  }
  return text;
}

function normalizeReleaseVerificationEvidence(
  input: Partial<SenaEnterpriseReleaseVerificationEvidence> | SenaEnterpriseReleaseGateReviewInput["verificationEvidence"] | undefined,
  command: string,
  recordedAt: string,
  fallbackSummary: string
): SenaEnterpriseReleaseVerificationEvidence {
  const rawStatus = input?.status ?? "not-run";
  if (!isEnterpriseReleaseVerificationStatus(rawStatus)) {
    throw new SenaEnterpriseError("Release verification status is not recognized.", 400, "invalid_release_verification_status");
  }
  const summary = input?.summary?.trim() || fallbackSummary;
  const outputSha256 = input?.outputSha256?.trim().toLowerCase() || createHash("sha256").update([
    command,
    rawStatus,
    summary,
    recordedAt
  ].join("\n")).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(outputSha256)) {
    throw new SenaEnterpriseError("Release verification outputSha256 must be a 64-character SHA-256 hex digest.", 400, "invalid_release_verification_hash");
  }
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence,
    command,
    status: rawStatus,
    summary: summary.slice(0, 2000),
    outputSha256,
    hashAlgorithm: "sha256",
    recordedAt
  };
}

function summarizeReleaseGateReviews(
  reviews: SenaEnterpriseReleaseGateReview[]
): SenaEnterpriseReleaseGateReviewList["summary"] {
  return {
    total: reviews.length,
    approved: reviews.filter((review) => review.decision === "approved").length,
    conditional: reviews.filter((review) => review.decision === "conditional").length,
    blocked: reviews.filter((review) => review.decision === "blocked").length,
    latestStatus: reviews[0]?.decision
  };
}

function buildEnterpriseDeploymentReleaseGateEvidence(
  reviews: SenaEnterpriseReleaseGateReview[]
): SenaEnterpriseOrganizationDeploymentPackage["releaseGate"] {
  const sortedReviews = [...reviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latestReview = sortedReviews[0];
  const latestIdentityRequestPacketEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = latestReview?.identityProductionSnapshot?.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews,
    generatedAt: now(),
    summary: summarizeReleaseGateReviews(sortedReviews),
    latestReview: latestReview ? {
      schemaVersion: latestReview.schemaVersion,
      id: latestReview.id,
      teamId: latestReview.teamId,
      environment: latestReview.environment,
      releaseVersion: latestReview.releaseVersion,
      decision: latestReview.decision,
      verificationCommand: latestReview.verificationCommand,
      verificationEvidence: latestReview.verificationEvidence,
      readinessSnapshot: latestReview.readinessSnapshot,
      platformDecisionSnapshot: latestReview.platformDecisionSnapshot,
      identityProductionSnapshot: latestReview.identityProductionSnapshot,
      approverRole: latestReview.approverRole,
      updatedAt: latestReview.updatedAt
    } : undefined,
    evidence: [
      "schema=sena-enterprise-release-gate-reviews/v1",
      `latestReview=${latestReview ? latestReview.schemaVersion : "missing"}`,
      `releaseGateReviews=${sortedReviews.length}`,
      `latestStatus=${latestReview?.decision ?? "missing"}`,
      `latestVerificationStatus=${latestReview?.verificationEvidence.status ?? "missing"}`,
      `latestVerificationOutputSha256=${latestReview?.verificationEvidence.outputSha256 ? "present" : "missing"}`,
      `latestReadinessBlocking=${latestReview?.readinessSnapshot.blockingReview ?? "missing"}`,
      `latestPlatformDecisionBlocking=${latestReview?.platformDecisionSnapshot.productionBlocking ?? "missing"}`,
      `latestIdentityProductionStatus=${latestReview?.identityProductionSnapshot?.status ?? "missing"}`,
      `latestIdentityVerifierIncomplete=${latestReview?.identityProductionSnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestIdentityVerifierMissing=${latestReview?.identityProductionSnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestIdentityVerifierMissingTechnical=${latestReview?.identityProductionSnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestIdentityRotationFreshness=${latestReview?.identityProductionSnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestIdentityCutoverChecklist=${latestReview?.identityProductionSnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestIdentityCutoverBlockers=${latestReview?.identityProductionSnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestIdentityProductionEvidenceDigest=${latestReview?.identityProductionSnapshot?.dossierDigest ?? "missing"}`,
      `latestIdentityEvidenceBindingDigest=${latestReview?.identityProductionSnapshot?.evidenceBindingDigest ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReview?.identityProductionSnapshot, "latestIdentity"),
      latestIdentityRequestPacketEvidence("requestPacketPolicyHash", "latestIdentityRequestPacketPolicyHash"),
      latestIdentityRequestPacketEvidence("requestPacketPolicyBinding", "latestIdentityRequestPacketPolicyBinding"),
      `latestIdentityEvidenceHostBinding=${latestReview?.identityProductionSnapshot?.evidenceUrlHostBinding.status ?? "missing"}`
    ].filter((evidence): evidence is string => Boolean(evidence))
  };
}

function enterpriseReleaseGatePlatformDecisionSnapshot(register: SenaEnterprisePlatformDecisionRegister): SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"] {
  const productionBlockingDecisions = register.decisions.filter((decision) => {
    const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      missingProductionEvidence.length > 0
    );
  });
  return {
    schemaVersion: register.schemaVersion,
    generatedAt: register.generatedAt,
    productionBlocking: register.summary.productionBlocking,
    open: register.summary.open,
    acceptedBridge: register.summary.acceptedBridge,
    productionBlockingDecisionIds: productionBlockingDecisions.map((decision) => decision.id),
    missingProductionEvidence: productionBlockingDecisions.flatMap((decision) =>
      missingPlatformDecisionProductionEvidence(decision).map((item) => ({
        decisionId: decision.id,
        evidenceId: item.id,
        label: item.label,
        status: item.status,
        source: item.source,
        nextAction: item.nextAction
      }))
    )
  };
}

function enterpriseReleaseGateIdentityProductionSnapshot(input: {
  generatedAt: string;
  teamId?: string;
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
}): SenaEnterpriseReleaseGateReview["identityProductionSnapshot"] {
  const latestIdentityAcceptances = latestPlatformDecisionAcceptances(input.platformDecisionAcceptances
    .filter((acceptance) => isIdentityProductionDecisionId(acceptance.decisionId)));
  const decisions: SenaEnterpriseIdentityProductionEvidence["decisions"] = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .map((decision) => ({
      id: decision.id as SenaEnterpriseIdentityProductionDecisionId,
      label: decision.label,
      status: decision.status,
      productionBlocking: decision.productionBlocking,
      acceptedBridge: decision.acceptedBridge,
      ownerEvidence: decision.ownerEvidence,
      acceptanceCriteria: decision.acceptanceCriteria
    }));
  const requirements = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .flatMap((decision) =>
      decision.evidenceChecklist
        .filter((item) => item.productionRequired)
        .map((item) => ({
          id: item.id,
          decisionId: decision.id as SenaEnterpriseIdentityProductionDecisionId,
          label: item.label,
          status: item.status,
          productionRequired: item.productionRequired,
          source: item.source,
          evidence: item.evidence,
          nextAction: item.nextAction
        }))
    );
  const acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"] = identityProductionDecisionIds
    .flatMap((decisionId) => {
      const acceptance = latestIdentityAcceptances.get(decisionId);
      if (!acceptance) return [];
      const productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance) ?? acceptance.productionEvidenceReceipt;
      return [{
        decisionId,
        status: acceptance.status,
        acceptedBridge: acceptance.acceptedBridge,
        ownerNameHash: sha256Text(acceptance.ownerName),
        ...(acceptance.productionEvidenceVerifiedAt ? {
          productionEvidenceVerifiedAtHash: sha256Text(acceptance.productionEvidenceVerifiedAt)
        } : {}),
        ownerRole: acceptance.ownerRole,
        environment: acceptance.environment,
        ...(acceptance.evidenceUrlHash ? { evidenceUrlHash: acceptance.evidenceUrlHash } : {}),
        ...(acceptance.evidenceUrlPathHash ? { evidenceUrlPathHash: acceptance.evidenceUrlPathHash } : {}),
        ...(acceptance.evidenceUrlHostHash ? { evidenceUrlHostHash: acceptance.evidenceUrlHostHash } : {}),
        ...(acceptance.evidenceUrlAllowedHostHash ? { evidenceUrlAllowedHostHash: acceptance.evidenceUrlAllowedHostHash } : {}),
        ...(productionEvidenceReceipt ? { productionEvidenceReceipt } : {}),
        updatedAt: acceptance.updatedAt
      }];
    });
  const missingEvidenceIds = Array.from(new Set(requirements
    .filter((requirement) => requirement.productionRequired && requirement.status === "missing")
    .map((requirement) => requirement.id)));
  const productionBlockingDecisionIds = identityProductionDecisionIds.filter((decisionId) => {
    const decision = input.platformDecisionRegister.decisions.find((candidate) => candidate.id === decisionId);
    if (!decision) return true;
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      missingPlatformDecisionProductionEvidence(decision).length > 0
    );
  });
  const submissionVerifier = buildEnterpriseIdentitySubmissionVerifier({
    generatedAt: input.generatedAt,
    requirements,
    acceptanceReceipts
  });
  const platformRequestPacket = buildEnterpriseIdentityPlatformDecisionRequestPacket({
    teamId: input.teamId,
    generatedAt: input.generatedAt,
    decisions,
    requirements,
    acceptanceReceipts
  });
  const cutoverChecklist = buildEnterpriseIdentityCutoverChecklist({
    generatedAt: input.generatedAt,
    requirements,
    acceptanceReceipts
  });
  const rotationFreshness = buildEnterpriseIdentityRotationFreshness(latestIdentityAcceptances, input.generatedAt);
  const evidenceUrlHostBinding = buildEnterpriseIdentityEvidenceUrlHostBinding(latestIdentityAcceptances);
  const receiptArchiveManifest = buildEnterpriseIdentityReceiptArchiveManifest({
    generatedAt: input.generatedAt,
    acceptanceReceipts
  });
  const receiptArchiveArtifactCompletenessReady = identityReceiptArchiveArtifactCompletenessReady(
    receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  const identityProductionDossier = buildEnterpriseIdentityProductionEvidenceDossier({
    generatedAt: input.generatedAt,
    teamId: input.teamId,
    platformDecisionRegister: input.platformDecisionRegister,
    platformDecisionAcceptances: input.platformDecisionAcceptances
  });
  const releaseGateBlocked = productionBlockingDecisionIds.length > 0 ||
    submissionVerifier.summary.incompleteDecisions > 0 ||
    submissionVerifier.summary.missingProductionEvidence > 0 ||
    submissionVerifier.summary.missingTechnicalPrerequisites > 0 ||
    cutoverChecklist.status !== "ready" ||
    rotationFreshness.status !== "ready" ||
    evidenceUrlHostBinding.status !== "ready" ||
    !receiptArchiveArtifactCompletenessReady ||
    receiptArchiveManifest.summary.readyForArchive !== identityProductionDecisionIds.length ||
    receiptArchiveManifest.summary.reviewArchives > 0 ||
    receiptArchiveManifest.summary.missingReceipts > 0;
  const status: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"] = releaseGateBlocked ? "review" : "ready";
  const snapshotCore: Omit<
    SenaEnterpriseReleaseGateReview["identityProductionSnapshot"],
    "dossierDigestAlgorithm" | "dossierDigestScope" | "dossierDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    generatedAt: input.generatedAt,
    status,
    evidenceBindingDigestAlgorithm: identityProductionDossier.evidenceBindingDigestAlgorithm,
    evidenceBindingDigestScope: identityProductionDossier.evidenceBindingDigestScope,
    evidenceBindingDigest: identityProductionDossier.evidenceBindingDigest,
    capabilityStatus: status,
    missingEvidenceIds,
    submissionVerifier: {
      schemaVersion: submissionVerifier.schemaVersion,
      verifiedDecisions: submissionVerifier.summary.verifiedDecisions,
      incompleteDecisions: submissionVerifier.summary.incompleteDecisions,
      missingProductionEvidence: submissionVerifier.summary.missingProductionEvidence,
      missingTechnicalPrerequisites: submissionVerifier.summary.missingTechnicalPrerequisites
    },
    rotationFreshness: {
      schemaVersion: rotationFreshness.schemaVersion,
      status: rotationFreshness.status,
      expiredEvidenceIds: rotationFreshness.checks
        .filter((check) => check.status === "expired")
        .map((check) => check.id),
      dueSoonEvidenceIds: rotationFreshness.checks
        .filter((check) => check.status === "due-soon")
        .map((check) => check.id)
    },
    platformRequestPacket: {
      schemaVersion: platformRequestPacket.schemaVersion,
      blockingRequests: platformRequestPacket.summary.blockingRequests,
      missingProductionEvidence: platformRequestPacket.summary.missingProductionEvidence,
      missingTechnicalPrerequisites: platformRequestPacket.summary.missingTechnicalPrerequisites,
      receiptReviewRequests: platformRequestPacket.summary.receiptReviewRequests,
      evidence: platformRequestPacket.evidence
    },
    evidenceUrlHostBinding,
    cutoverChecklist,
    receiptArchiveManifest: {
      schemaVersion: receiptArchiveManifest.schemaVersion,
      archiveManifestDigestAlgorithm: receiptArchiveManifest.archiveManifestDigestAlgorithm,
      archiveManifestDigestScope: receiptArchiveManifest.archiveManifestDigestScope,
      archiveManifestDigest: receiptArchiveManifest.archiveManifestDigest,
      summary: receiptArchiveManifest.summary,
      decisions: receiptArchiveManifest.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        archiveStatus: decision.archiveStatus,
        ...(decision.receiptVerifierStatus ? { receiptVerifierStatus: decision.receiptVerifierStatus } : {}),
        digestHeader: decision.digestHeader,
        ...(decision.receiptAuditDigest ? { receiptAuditDigest: decision.receiptAuditDigest } : {}),
        ...(decision.receiptAuditDigestScope ? { receiptAuditDigestScope: decision.receiptAuditDigestScope } : {}),
        stableSubmissionDigestHeader: decision.stableSubmissionDigestHeader,
        ...(decision.submittedEvidenceDigest ? { submittedEvidenceDigest: decision.submittedEvidenceDigest } : {}),
        ...(decision.submittedEvidenceDigestScope ? { submittedEvidenceDigestScope: decision.submittedEvidenceDigestScope } : {}),
        ...(decision.productionEvidenceArtifactDigestAlgorithm ? {
          productionEvidenceArtifactDigestAlgorithm: decision.productionEvidenceArtifactDigestAlgorithm
        } : {}),
        ...(decision.productionEvidenceArtifactDigestScope ? {
          productionEvidenceArtifactDigestScope: decision.productionEvidenceArtifactDigestScope
        } : {}),
        ...(decision.productionEvidenceArtifactDigest ? {
          productionEvidenceArtifactDigest: decision.productionEvidenceArtifactDigest
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCoveredEvidenceIds ? {
          productionEvidenceArtifactDigestCoveredEvidenceIds: decision.productionEvidenceArtifactDigestCoveredEvidenceIds
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCoverageStatus ? {
          productionEvidenceArtifactDigestCoverageStatus: decision.productionEvidenceArtifactDigestCoverageStatus
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCompletenessStatus ? {
          productionEvidenceArtifactDigestCompletenessStatus: decision.productionEvidenceArtifactDigestCompletenessStatus
        } : {}),
        missingArchiveInputs: decision.missingArchiveInputs,
        ...(decision.requestPacketPolicyBindingStatus ? { requestPacketPolicyBindingStatus: decision.requestPacketPolicyBindingStatus } : {}),
        ...(decision.technicalBindingStatus ? { technicalBindingStatus: decision.technicalBindingStatus } : {}),
        ...(decision.technicalReadinessStatus ? { technicalReadinessStatus: decision.technicalReadinessStatus } : {}),
        ...(decision.evidenceUrlHostBindingStatus ? { evidenceUrlHostBindingStatus: decision.evidenceUrlHostBindingStatus } : {}),
        ...(decision.rotationFreshnessStatus ? { rotationFreshnessStatus: decision.rotationFreshnessStatus } : {})
      }))
    },
    institutionActionPlan: identityProductionDossier.institutionActionPlan,
    releaseGateBlocked
  };
  return {
    ...snapshotCore,
    dossierDigestAlgorithm: identityProductionDossier.dossierDigestAlgorithm,
    dossierDigestScope: identityProductionDossier.dossierDigestScope,
    dossierDigest: identityProductionDossier.dossierDigest
  };
}

const identityProductionDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [
  "institution-idp-approval",
  "institution-provisioning-owner"
];

const identityReceiptArchiveMissingInputOrder: SenaEnterpriseIdentityReceiptArchiveMissingInput[] = [
  "productionEvidenceReceipt",
  "receiptAuditDigest",
  "submittedEvidenceDigest",
  "productionEvidenceArtifactDigest",
  "requestPacketPolicyBinding",
  "productionEvidenceCompleteness",
  "technicalEvidenceBinding",
  "technicalReadiness",
  "evidenceUrlHostBinding",
  "rotationFreshness"
];

const identityPlatformDecisionSubmissionRequiredBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["requiredBodyFields"] = [
  "teamId",
  "decisionId",
  "status",
  "acceptedBridge",
  "ownerName",
  "ownerRole",
  "environment",
  "evidenceUrl",
  "productionEvidenceIds",
  "productionEvidenceArtifactDigest",
  "productionEvidenceVerifiedAt",
  "requestPacketPolicyHash",
  "notes"
];

const identityProductionEvidenceSubmissionBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["identityProductionEvidenceBodyFields"] = [
  "evidenceUrl",
  "productionEvidenceIds",
  "productionEvidenceArtifactDigest",
  "productionEvidenceVerifiedAt",
  "requestPacketPolicyHash"
];

const identityReceiptAuditDigestScope = "current-validation-snapshot" as const;
const identitySubmittedEvidenceDigestScope = "platform-submission-inputs" as const;
const identityProductionEvidenceArtifactDigestScope = "external-evidence-artifact" as const;
const identityProductionEvidenceArtifactDigestResponseHeader = "x-sena-identity-production-evidence-artifact-digest" as const;
const identityProductionEvidenceArtifactCoveredIdsResponseHeader = "x-sena-identity-production-evidence-artifact-covered-ids" as const;
const identityProductionEvidenceArtifactCoverageResponseHeader = "x-sena-identity-production-evidence-artifact-coverage" as const;
const identityProductionEvidenceArtifactCompletenessResponseHeader = "x-sena-identity-production-evidence-artifact-completeness" as const;
const identityStableSubmissionDigestInputFields = [
  "schemaVersion",
  "submittedEvidenceDigestAlgorithm",
  "submittedEvidenceDigestScope",
  "decisionId",
  "status",
  "acceptedBridge",
  "ownerNameHash",
  "ownerRoleHash",
  "environmentHash",
  "productionEvidenceVerifiedAtHash",
  "submittedEvidenceIds",
  "evidenceUrlHash",
  "evidenceUrlPathHash",
  "evidenceUrlHostHash",
  "evidenceUrlAllowedHostHash",
  "productionEvidenceArtifactDigestAlgorithm",
  "productionEvidenceArtifactDigestScope",
  "productionEvidenceArtifactDigest",
  "productionEvidenceArtifactDigestCoveredEvidenceIds",
  "productionEvidenceArtifactDigestCoverageStatus",
  "productionEvidenceArtifactDigestCompletenessStatus",
  "requestPacketSchemaVersion",
  "submittedRequestPacketPolicyHash",
  "technicalEvidenceBinding"
] as const;

function identityProductionEvidenceArtifactCompletenessStatus(
  allowedEvidenceIds: string[],
  coveredEvidenceIds: string[],
  hasArtifactDigest: boolean
): "complete" | "partial" | "missing" {
  if (!hasArtifactDigest) return "missing";
  const coveredEvidenceIdSet = new Set(coveredEvidenceIds);
  return allowedEvidenceIds.every((evidenceId) => coveredEvidenceIdSet.has(evidenceId))
    ? "complete"
    : "partial";
}

function identityProductionArtifactDigestRequiredEvidenceIds() {
  return identityProductionDecisionIds.flatMap((decisionId) =>
    platformDecisionProductionEvidenceIdsByDecision[decisionId] ?? []
  );
}

function identityProductionEvidenceArtifactDigestSubmissionPolicy(): SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["productionEvidenceArtifactDigestPolicy"] {
  return {
    required: true,
    algorithm: "sha256",
    scope: identityProductionEvidenceArtifactDigestScope,
    digestBodyField: "productionEvidenceArtifactDigest",
    responseHeader: identityProductionEvidenceArtifactDigestResponseHeader,
    requiredForEvidenceIds: identityProductionArtifactDigestRequiredEvidenceIds(),
    artifactCustody: "institution-owned-evidence-system",
    rawArtifactUploadAccepted: false,
    secretValuesAccepted: false
  };
}

function identityProductionEvidenceArtifactDigestTemplatePolicy(
  requiredForEvidenceIds: string[]
): SenaEnterpriseIdentityPlatformDecisionRequestPacket["requests"][number]["submissionTemplate"]["productionEvidenceArtifactDigestPolicy"] {
  return {
    required: true,
    algorithm: "sha256",
    scope: identityProductionEvidenceArtifactDigestScope,
    requiredForEvidenceIds,
    artifactCustody: "institution-owned-evidence-system",
    rawArtifactUploadAccepted: false,
    secretValuesAccepted: false,
    responseHeader: identityProductionEvidenceArtifactDigestResponseHeader
  };
}

const identityPlatformDecisionResponseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"] = [
  "x-sena-identity-request-packet-policy-hash",
  "x-sena-identity-request-packet-policy-binding",
  "x-sena-identity-production-receipt-digest",
  "x-sena-identity-submitted-evidence-digest",
  identityProductionEvidenceArtifactDigestResponseHeader,
  identityProductionEvidenceArtifactCoveredIdsResponseHeader,
  identityProductionEvidenceArtifactCoverageResponseHeader,
  identityProductionEvidenceArtifactCompletenessResponseHeader,
  "x-sena-identity-submitted-decision-production-evidence-artifact-completeness",
  "x-sena-identity-production-verifier-status",
  "x-sena-identity-evidence-url-host-binding",
  "x-sena-identity-technical-binding",
  "x-sena-identity-technical-readiness",
  "x-sena-identity-rotation-freshness",
  "x-sena-identity-rotation-expired-evidence",
  "x-sena-identity-rotation-due-soon-evidence",
  "x-sena-identity-receipt-archive-status",
  "x-sena-identity-submitted-decision-receipt-archive-missing-inputs",
  "x-sena-identity-receipt-archive-missing-inputs",
  "x-sena-identity-production-evidence-digest",
  "x-sena-identity-evidence-binding-digest",
  "x-sena-identity-receipt-archive-manifest-digest",
  "x-sena-identity-production-status",
  "x-sena-identity-release-gate-blocked",
  "x-sena-identity-request-blockers",
  "x-sena-identity-receipt-review-requests",
  "x-sena-identity-production-blocking-decisions",
  "x-sena-identity-missing-evidence-ids",
  "x-sena-identity-cutover-checklist",
  "x-sena-identity-cutover-blockers",
  "x-sena-identity-production-evidence-artifact-completeness-summary"
];

const identityPlatformDecisionReceiptArchiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"] = [
  "acceptance.productionEvidenceReceipt",
  "identityProductionEvidence.submissionVerifier",
  "identityProductionEvidence.cutoverChecklist",
  "identityProductionEvidence.platformRequestPacket",
  "identityProductionEvidence.receiptArchiveManifest",
  "identityProductionEvidence.institutionActionPlan"
];

const identityPlatformDecisionReceiptArchivePolicy: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"] = {
  required: true,
  digestAlgorithm: "sha256",
  digestHeader: "x-sena-identity-production-receipt-digest",
  digestScope: identityReceiptAuditDigestScope,
  stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
  stableSubmissionDigestScope: identitySubmittedEvidenceDigestScope,
  stableSubmissionDigestInputFields: [...identityStableSubmissionDigestInputFields],
  archiveHeaders: identityPlatformDecisionResponseAuditHeaders,
  archiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
  redaction: {
    secretValuesExcluded: true,
    evidenceUrlValuesExcluded: true,
    evidenceUrlsHashed: true,
    ownerNamesHashed: true,
    productionEvidenceTimestampsHashed: true
  }
};

function isIdentityProductionDecisionId(id: string): id is SenaEnterpriseIdentityProductionDecisionId {
  return identityProductionDecisionIds.includes(id as SenaEnterpriseIdentityProductionDecisionId);
}

const identityCutoverChecklistSpecs: Array<{
  id: SenaEnterpriseIdentityCutoverChecklist["items"][number]["id"];
  label: string;
  decisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  evidenceIds: string[];
  readyNextAction: string;
}> = [
  {
    id: "idp-tenant-approval",
    label: "Institution IdP tenant and callback approval",
    decisionIds: ["institution-idp-approval"],
    evidenceIds: ["idp-tenant-approval", "idp-callback-approval", "idp-tenant-binding"],
    readyNextAction: "Keep institution IdP tenant, callback, and runtime tenant-binding evidence attached to release checks."
  },
  {
    id: "sso-secret-custody",
    label: "SSO provider secrets and institution secret-store custody",
    decisionIds: ["institution-idp-approval"],
    evidenceIds: ["sso-provider-secrets", "sso-secret-store-reference"],
    readyNextAction: "Keep SSO provider secret and institution secret-store reference evidence attached to release checks."
  },
  {
    id: "scim-idp-ownership",
    label: "SCIM or IdP lifecycle ownership",
    decisionIds: ["institution-provisioning-owner"],
    evidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "identity-lifecycle-owner-mode", "lifecycle-guardrails"],
    readyNextAction: "Keep SCIM or IdP lifecycle ownership and guardrail evidence attached to release checks."
  },
  {
    id: "identity-secret-rotation",
    label: "SSO and provisioning secret rotation",
    decisionIds: ["institution-idp-approval", "institution-provisioning-owner"],
    evidenceIds: ["sso-secret-rotation", "bearer-token-rotation", "identity-secret-rotation-cadence"],
    readyNextAction: "Keep SSO client-secret and provisioning bearer-token rotation evidence attached to release checks."
  }
];

function buildEnterpriseIdentityCutoverChecklist(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"];
}): SenaEnterpriseIdentityCutoverChecklist {
  if (isSelfManagedEnterpriseMode()) {
    const items: SenaEnterpriseIdentityCutoverChecklist["items"] = identityCutoverChecklistSpecs.map((spec) => ({
      id: spec.id,
      label: spec.label,
      status: "ready",
      source: "mixed",
      decisionIds: spec.decisionIds,
      evidenceIds: spec.evidenceIds,
      acceptedEvidenceIds: [],
      presentEvidenceIds: spec.evidenceIds,
      missingEvidenceIds: [],
      artifactCompletenessStatus: "complete",
      nextActions: [selfManagedIdentityNextAction()]
    }));
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist,
      generatedAt: input.generatedAt,
      status: "ready",
      summary: {
        items: items.length,
        readyItems: items.length,
        blockingItems: 0,
        artifactCompletenessCounts: { complete: identityProductionDecisionIds.length }
      },
      items,
      evidence: [
        "schema=sena-enterprise-identity-cutover-checklist/v1",
        "cutoverChecklistStatus=ready",
        "cutoverBlockers=0",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ]
    };
  }
  const uniqueEvidenceIds = (values: string[]) => Array.from(new Set(values));
  const receiptByDecision = new Map(input.acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt.productionEvidenceReceipt]));
  const artifactCompletenessByDecision = (decisionId: SenaEnterpriseIdentityProductionDecisionId) =>
    receiptByDecision.get(decisionId)?.productionEvidenceArtifactDigestCompletenessStatus ?? "missing";
  const artifactCompletenessCounts = identityProductionDecisionIds.reduce<Partial<Record<"complete" | "partial" | "missing", number>>>((counts, decisionId) => {
    const status = artifactCompletenessByDecision(decisionId);
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const items = identityCutoverChecklistSpecs.map((spec) => {
    const evidenceIdSet = new Set(spec.evidenceIds);
    const matchingRequirements = input.requirements.filter((requirement) =>
      evidenceIdSet.has(requirement.id) && spec.decisionIds.includes(requirement.decisionId)
    );
    const mappedEvidenceIds = new Set(matchingRequirements.map((requirement) => requirement.id));
    const unmappedEvidenceIds = spec.evidenceIds.filter((evidenceId) => !mappedEvidenceIds.has(evidenceId));
    const missingEvidenceIds = uniqueEvidenceIds([
      ...matchingRequirements
        .filter((requirement) => requirement.status === "missing")
        .map((requirement) => requirement.id),
      ...unmappedEvidenceIds
    ]);
    const acceptedEvidenceIds = uniqueEvidenceIds(matchingRequirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.id));
    const presentEvidenceIds = uniqueEvidenceIds(matchingRequirements
      .filter((requirement) => requirement.status === "present")
      .map((requirement) => requirement.id));
    const sourceKinds = new Set(matchingRequirements.map((requirement) => requirement.source));
    const source: SenaEnterpriseIdentityCutoverChecklist["items"][number]["source"] = sourceKinds.size === 1
      ? Array.from(sourceKinds)[0] ?? "mixed"
      : "mixed";
    const artifactCompletenessStatuses = spec.decisionIds.map((decisionId) => artifactCompletenessByDecision(decisionId));
    const artifactCompletenessStatus: SenaEnterpriseIdentityCutoverChecklist["items"][number]["artifactCompletenessStatus"] =
      artifactCompletenessStatuses.every((status) => status === "complete")
        ? "complete"
        : artifactCompletenessStatuses.every((status) => status === "missing")
          ? "missing"
          : "partial";
    const missingEvidenceNextActions = Array.from(new Set(matchingRequirements
      .filter((requirement) => missingEvidenceIds.includes(requirement.id))
      .map((requirement) => requirement.nextAction)));
    const artifactCompletenessNextActions = artifactCompletenessStatus === "complete"
      ? []
      : [`Attach complete ${spec.label} external evidence artifact digest before cutover.`];
    const status = missingEvidenceIds.length === 0 && artifactCompletenessStatus === "complete"
      ? "ready" as const
      : "review" as const;
    return {
      id: spec.id,
      label: spec.label,
      status,
      source,
      decisionIds: spec.decisionIds,
      evidenceIds: spec.evidenceIds,
      acceptedEvidenceIds,
      presentEvidenceIds,
      missingEvidenceIds,
      artifactCompletenessStatus,
      nextActions: status === "ready"
        ? [spec.readyNextAction]
        : Array.from(new Set([...missingEvidenceNextActions, ...artifactCompletenessNextActions]))
    };
  });
  const readyItems = items.filter((item) => item.status === "ready").length;
  const blockingItems = items.length - readyItems;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist,
    generatedAt: input.generatedAt,
    status: blockingItems === 0 ? "ready" : "review",
    summary: {
      items: items.length,
      readyItems,
      blockingItems,
      artifactCompletenessCounts
    },
    items,
    evidence: [
      "schema=sena-enterprise-identity-cutover-checklist/v1",
      `cutoverChecklistStatus=${blockingItems === 0 ? "ready" : "review"}`,
      `cutoverChecklistItems=${items.length}`,
      `cutoverReady=${readyItems}`,
      `cutoverBlockers=${blockingItems}`,
      `cutoverArtifactCompleteness=${formatIdentityReceiptArchiveArtifactCompletenessCounts(artifactCompletenessCounts)}`,
      ...items.map((item) => `cutover:${item.id}=${item.status};missing=${item.missingEvidenceIds.join("|") || "none"};artifactCompleteness=${item.artifactCompletenessStatus}`)
    ]
  };
}

function buildEnterpriseIdentityPlatformDecisionRequestPacket(input: {
  teamId?: string;
  generatedAt: string;
  decisions: SenaEnterpriseIdentityProductionEvidence["decisions"];
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"];
}): SenaEnterpriseIdentityPlatformDecisionRequestPacket {
  const acceptanceByDecision = new Map(input.acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  const requests: SenaEnterpriseIdentityPlatformDecisionRequestPacket["requests"] = input.decisions.map((decision) => {
    const acceptance = acceptanceByDecision.get(decision.id);
    const decisionRequirements = input.requirements.filter((requirement) => requirement.decisionId === decision.id);
    const platformRequirements = decisionRequirements.filter((requirement) => requirement.source === "platform-acceptance");
    const technicalRequirements = decisionRequirements.filter((requirement) => requirement.source === "technical-readiness");
    const missingProductionEvidenceIds = platformRequirements
      .filter((requirement) => requirement.status === "missing")
      .map((requirement) => requirement.id);
    const acceptedProductionEvidenceIds = platformRequirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.id);
    const missingTechnicalPrerequisiteEvidenceIds = technicalRequirements
      .filter((requirement) => requirement.status === "missing")
      .map((requirement) => requirement.id);
    const requestedProductionEvidenceIds = missingProductionEvidenceIds;
    const productionEvidenceReceipt = acceptance?.productionEvidenceReceipt;
    const submissionProductionEvidenceIds = requestedProductionEvidenceIds.length > 0
      ? requestedProductionEvidenceIds
      : platformRequirements.map((requirement) => requirement.id);
    const productionEvidenceVerifiedAtRequiredForEvidenceIds = submissionProductionEvidenceIds;
    const rotationEvidenceIds = identityRotationFreshnessSpecs
      .filter((spec) => spec.decisionId === decision.id)
      .map((spec) => spec.id);
    const requestPacketPolicyHash = identityRequestPacketPolicyHash();
    const ownerRolePlaceholder = acceptance?.ownerRole ?? "Institution identity platform owner";
    const environmentPlaceholder = acceptance?.environment ?? "production";
    const evidenceUrlPlaceholder = "https://<institution-evidence-host>/sena/identity-evidence";
    const notesTemplate = `Attach institution-owned evidence for ${platformRequirements.map((requirement) => requirement.label).join("; ")}. Do not paste secrets.`;
    const nextActions = Array.from(new Set(
      [...platformRequirements, ...technicalRequirements]
        .filter((requirement) => requirement.status === "missing")
        .map((requirement) => requirement.nextAction)
    ));
    const blocking = decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      missingProductionEvidenceIds.length > 0 ||
      missingTechnicalPrerequisiteEvidenceIds.length > 0 ||
      productionEvidenceReceipt?.verifierStatus === "review" ||
      acceptance?.status === "rejected" ||
      acceptance?.status === "needs-native-adapter"
    );
    const technicalEvidenceBinding = buildEnterpriseIdentityTechnicalEvidenceBinding(decision.id);
    return {
      decisionId: decision.id,
      label: decision.label,
      status: acceptance?.status ?? decision.status,
      acceptedBridge: decision.acceptedBridge,
      blocking,
      ...(acceptance?.ownerRole ? { ownerRole: acceptance.ownerRole } : {}),
      ...(acceptance?.environment ? { environment: acceptance.environment } : {}),
      ...(acceptance?.evidenceUrlHash ? { evidenceUrlHash: acceptance.evidenceUrlHash } : {}),
      ...(acceptance?.evidenceUrlPathHash ? { evidenceUrlPathHash: acceptance.evidenceUrlPathHash } : {}),
      requestedProductionEvidenceIds,
      acceptedProductionEvidenceIds,
      missingProductionEvidenceIds,
      technicalPrerequisiteEvidenceIds: technicalRequirements.map((requirement) => requirement.id),
      missingTechnicalPrerequisiteEvidenceIds,
      ...(productionEvidenceReceipt?.verifierStatus ? { latestReceiptVerifierStatus: productionEvidenceReceipt.verifierStatus } : {}),
      ...(productionEvidenceReceipt?.technicalBindingStatus ? { latestReceiptTechnicalBindingStatus: productionEvidenceReceipt.technicalBindingStatus } : {}),
      ...(productionEvidenceReceipt?.technicalReadinessStatus ? { latestReceiptTechnicalReadinessStatus: productionEvidenceReceipt.technicalReadinessStatus } : {}),
      ...(productionEvidenceReceipt?.evidenceUrlHostBindingStatus ? { latestReceiptEvidenceUrlHostBindingStatus: productionEvidenceReceipt.evidenceUrlHostBindingStatus } : {}),
      ...(productionEvidenceReceipt?.requestPacketPolicyBindingStatus ? { latestReceiptRequestPacketPolicyBindingStatus: productionEvidenceReceipt.requestPacketPolicyBindingStatus } : {}),
      ...(productionEvidenceReceipt?.rotationFreshnessStatus ? { latestReceiptRotationFreshnessStatus: productionEvidenceReceipt.rotationFreshnessStatus } : {}),
      ...(productionEvidenceReceipt?.rotationExpiredEvidenceIds ? { latestReceiptRotationExpiredEvidenceIds: productionEvidenceReceipt.rotationExpiredEvidenceIds } : {}),
      ...(productionEvidenceReceipt?.rotationDueSoonEvidenceIds ? { latestReceiptRotationDueSoonEvidenceIds: productionEvidenceReceipt.rotationDueSoonEvidenceIds } : {}),
      ...(technicalEvidenceBinding ? { technicalEvidenceBinding } : {}),
      nextActions: nextActions.length > 0
        ? nextActions
        : [`Keep ${decision.label} production evidence attached to release checks.`],
      acceptanceCriteria: decision.acceptanceCriteria,
      submissionTemplate: {
        teamIdField: "teamId",
        decisionId: decision.id,
        status: "accepted",
        acceptedBridge: true,
        ownerNamePlaceholder: "Institution platform owner",
        ownerNamePolicy: {
          specificInstitutionOwnerRequired: true,
          genericPlaceholderRejected: true,
          rejectedPlaceholderNames: Array.from(genericIdentityProductionOwnerNames).sort()
        },
        ownerRolePlaceholder,
        environmentPlaceholder,
        evidenceUrlPlaceholder,
        productionEvidenceIds: submissionProductionEvidenceIds,
        productionEvidenceArtifactDigestField: "productionEvidenceArtifactDigest",
        productionEvidenceArtifactDigestPolicy: identityProductionEvidenceArtifactDigestTemplatePolicy(submissionProductionEvidenceIds),
        productionEvidenceVerifiedAtField: "productionEvidenceVerifiedAt",
        productionEvidenceVerifiedAtRequiredForEvidenceIds,
        productionEvidenceVerifiedAtPolicy: {
          required: true,
          requiredForEvidenceIds: productionEvidenceVerifiedAtRequiredForEvidenceIds,
          validPastOrPresentRequired: true,
          futureTimestampsRejected: true,
          canonicalIsoTimestampRequired: true
        },
        rotationFreshnessPolicy: {
          maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
          warningDays: identityRotationFreshnessPolicy.warningDays,
          rotationEvidenceIds,
          expiredEvidenceBlocksRelease: true,
          dueSoonEvidenceWarns: true
        },
        requestPacketPolicyHash,
        submissionDraft: {
          teamId: input.teamId ?? "<teamId>",
          decisionId: decision.id,
          status: "accepted",
          acceptedBridge: true,
          ownerName: "<specific-institution-owner-name>",
          ownerRole: ownerRolePlaceholder,
          environment: environmentPlaceholder,
          evidenceUrl: evidenceUrlPlaceholder,
          productionEvidenceIds: submissionProductionEvidenceIds,
          productionEvidenceArtifactDigest: "<sha256-hex-artifact-digest>",
          productionEvidenceVerifiedAt: "<canonical-iso-timestamp>",
          requestPacketPolicyHash,
          notes: notesTemplate
        },
        notesTemplate
      }
    };
  });
  const blockingRequests = requests.filter((request) => request.blocking).length;
  const missingProductionEvidence = requests.reduce((total, request) => total + request.missingProductionEvidenceIds.length, 0);
  const missingTechnicalPrerequisites = requests.reduce((total, request) => total + request.missingTechnicalPrerequisiteEvidenceIds.length, 0);
  const receiptReviewRequests = requests.filter((request) => request.latestReceiptVerifierStatus === "review").length;
  const requestPacketPolicyHash = identityRequestPacketPolicyHash();
  const requestPacketPolicyBinding = `idp:${requests.find((request) => request.decisionId === "institution-idp-approval")?.latestReceiptRequestPacketPolicyBindingStatus ?? "missing"}|provisioning:${requests.find((request) => request.decisionId === "institution-provisioning-owner")?.latestReceiptRequestPacketPolicyBindingStatus ?? "missing"}`;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket,
    generatedAt: input.generatedAt,
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      evidenceUrlsHashed: true
    },
    summary: {
      requests: requests.length,
      blockingRequests,
      missingProductionEvidence,
      missingTechnicalPrerequisites,
      readyRequests: requests.length - blockingRequests,
      receiptReviewRequests
    },
    submission: {
      method: "POST",
      path: "/api/sena/ops/platform-decisions",
      responseSchema: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
      responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
      receiptArchivePolicy: identityPlatformDecisionReceiptArchivePolicy,
      requiredAcceptedStatus: "accepted",
      requiredAcceptedBridge: true,
      requiredBodyFields: identityPlatformDecisionSubmissionRequiredBodyFields,
      identityProductionEvidenceBodyFields: identityProductionEvidenceSubmissionBodyFields,
      productionEvidenceArtifactDigestPolicy: identityProductionEvidenceArtifactDigestSubmissionPolicy(),
      evidenceUrlPolicy: identityEvidenceUrlPolicy(),
      ownerRolePolicy: identityProductionOwnerRolePolicy,
      notesPolicy: identityProductionEvidenceNotesPolicy(),
      freeTextPolicy: identityProductionEvidenceFreeTextPolicy()
    },
    requests,
    evidence: [
      "schema=sena-enterprise-identity-platform-decision-request-packet/v1",
      `requests=${requests.length}`,
      `blockingRequests=${blockingRequests}`,
      `missingProductionEvidence=${missingProductionEvidence}`,
      `missingTechnicalPrerequisites=${missingTechnicalPrerequisites}`,
      `readyRequests=${requests.length - blockingRequests}`,
      `receiptReviewRequests=${receiptReviewRequests}`,
      `requestPacketPolicyHash=${requestPacketPolicyHash}`,
      `requestPacketPolicyBinding=${requestPacketPolicyBinding}`,
      "requestPacketPolicyHashRequired=true",
      "submissionDrafts=redacted-platform-owner-json",
      "submission=/api/sena/ops/platform-decisions",
      "submissionMethod=POST",
      "submissionPath=/api/sena/ops/platform-decisions",
      "responseSchema=sena-enterprise-platform-decision-production-evidence-receipt/v1",
      `responseAuditHeaders=${identityPlatformDecisionResponseAuditHeaders.join("|")}`,
      `receiptArchivePolicy=required;digestHeader=${identityPlatformDecisionReceiptArchivePolicy.digestHeader};stableDigestHeader=${identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader};bodyPaths=${identityPlatformDecisionReceiptArchiveBodyPaths.join("|")}`,
      `stableSubmissionDigestInputFields=${identityStableSubmissionDigestInputFields.join("|")}`,
      "requiredAcceptedStatus=accepted",
      "requiredAcceptedBridge=true",
      `requiredBodyFields=${identityPlatformDecisionSubmissionRequiredBodyFields.join("|")}`,
      `identityProductionEvidenceBodyFields=${identityProductionEvidenceSubmissionBodyFields.join("|")}`,
      "productionEvidenceArtifactDigestPolicy=sha256|external-evidence-artifact|institution-custody|no-raw-artifact-upload",
      "productionEvidenceArtifactDigest=sha256|required-for-archive",
      "evidenceUrlPolicy=https|institution-owned|required;forbidden=local-or-private|sena-application-origin|reserved-example-or-test",
      "evidenceUrlRequiredForProductionEvidence=true",
      "evidenceUrlPath=specific-path-required",
      "evidenceUrlSecretCarriers=credentials|fragments|sensitive-query-rejected",
      "notesSecretCarriers=sensitive-assignments|bearer-tokens-rejected",
      "freeTextSecretCarriers=ownerName|ownerRole|environment|notes",
      "productionEvidenceVerifiedAt=required|past-or-present|canonical-iso",
      `senaAppOrigin=${configuredSenaAppOrigin() ? "hash-present" : "missing"}`,
      `evidenceUrlAllowedHosts=${identityEvidenceAllowedHostEvidence()}`,
      `ownerRolePolicy=forbidden:${identityProductionOwnerRolePolicy.forbiddenTokens.join("|")};institution:${identityProductionOwnerRolePolicy.institutionOwnerTokens.join("|")};idp:${identityProductionOwnerRolePolicy.requiredSemanticTokensByDecision["institution-idp-approval"].join("|")};provisioning:${identityProductionOwnerRolePolicy.requiredSemanticTokensByDecision["institution-provisioning-owner"].join("|")}`,
      "redaction=secret-values-excluded|evidence-url-values-excluded"
    ]
  };
}

function buildEnterpriseIdentitySubmissionVerifier(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"];
}): SenaEnterpriseIdentitySubmissionVerifier {
  if (isSelfManagedEnterpriseMode()) {
    const expectedSubmissions: SenaEnterpriseIdentitySubmissionVerifier["expectedSubmissions"] = identityProductionDecisionIds.map((decisionId) => ({
      decisionId,
      requestPacketSchemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1",
      requiredAcceptedStatus: "accepted",
      requiredAcceptedBridge: true,
      evidenceUrlRequired: false,
      verifierStatus: "ready",
      expectedProductionEvidenceIds: [],
      matchedRequestEvidenceIds: [],
      unexpectedEvidenceIds: [],
      stillMissingEvidenceIds: [],
      technicalPrerequisiteEvidenceIds: [],
      missingTechnicalPrerequisiteEvidenceIds: [],
      requestPacketPolicyBindingStatus: "not-required"
    }));
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier,
      generatedAt: input.generatedAt,
      redaction: {
        secretValuesExcluded: true,
        evidenceUrlValuesExcluded: true,
        evidenceUrlsHashed: true
      },
      summary: {
        expectedDecisions: expectedSubmissions.length,
        verifiedDecisions: expectedSubmissions.length,
        incompleteDecisions: 0,
        missingProductionEvidence: 0,
        missingTechnicalPrerequisites: 0
      },
      expectedSubmissions,
      evidence: [
        "schema=sena-enterprise-identity-submission-verifier/v1",
        `expectedDecisions=${expectedSubmissions.length}`,
        `verifiedDecisions=${expectedSubmissions.length}`,
        "missingProductionEvidence=0",
        "missingTechnicalPrerequisites=0",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ]
    };
  }
  const receiptByDecision = new Map(input.acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  const expectedSubmissions: SenaEnterpriseIdentitySubmissionVerifier["expectedSubmissions"] = identityProductionDecisionIds.map((decisionId) => {
    const platformRequirements = input.requirements.filter((requirement) =>
      requirement.decisionId === decisionId && requirement.source === "platform-acceptance"
    );
    const technicalRequirements = input.requirements.filter((requirement) =>
      requirement.decisionId === decisionId && requirement.source === "technical-readiness"
    );
    const expectedProductionEvidenceIds = platformRequirements.map((requirement) => requirement.id);
    const technicalPrerequisiteEvidenceIds = technicalRequirements.map((requirement) => requirement.id);
    const receipt = receiptByDecision.get(decisionId);
    const productionReceipt = receipt?.productionEvidenceReceipt;
    const stillMissingEvidenceIds = productionReceipt?.stillMissingEvidenceIds ??
      platformRequirements
        .filter((requirement) => requirement.status === "missing")
        .map((requirement) => requirement.id);
    const missingTechnicalPrerequisiteEvidenceIds = technicalRequirements
      .filter((requirement) => requirement.status === "missing")
      .map((requirement) => requirement.id);
    const productionVerifierStatus = productionReceipt?.verifierStatus ??
      (stillMissingEvidenceIds.length === 0 && receipt?.status === "accepted" && receipt.acceptedBridge ? "ready" : "review");
    const verifierStatus = productionVerifierStatus === "ready" && missingTechnicalPrerequisiteEvidenceIds.length === 0
      ? "ready"
      : "review";
    return {
      decisionId,
      requestPacketSchemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1",
      requiredAcceptedStatus: "accepted",
      requiredAcceptedBridge: true,
      evidenceUrlRequired: true,
      verifierStatus,
      expectedProductionEvidenceIds,
      matchedRequestEvidenceIds: productionReceipt?.matchedRequestEvidenceIds ?? [],
      unexpectedEvidenceIds: productionReceipt?.unexpectedEvidenceIds ?? [],
      stillMissingEvidenceIds,
      technicalPrerequisiteEvidenceIds,
      missingTechnicalPrerequisiteEvidenceIds,
      ...(productionReceipt?.requestPacketPolicyHash ? { requestPacketPolicyHash: productionReceipt.requestPacketPolicyHash } : {}),
      ...(productionReceipt?.submittedRequestPacketPolicyHash ? { submittedRequestPacketPolicyHash: productionReceipt.submittedRequestPacketPolicyHash } : {}),
      ...(productionReceipt?.requestPacketPolicyBindingStatus ? { requestPacketPolicyBindingStatus: productionReceipt.requestPacketPolicyBindingStatus } : {}),
      ...(receipt?.evidenceUrlHash ? { evidenceUrlHash: receipt.evidenceUrlHash } : {}),
      ...(receipt?.evidenceUrlPathHash ? { evidenceUrlPathHash: receipt.evidenceUrlPathHash } : {})
    };
  });
  const verifiedDecisions = expectedSubmissions.filter((submission) => submission.verifierStatus === "ready").length;
  const missingProductionEvidence = expectedSubmissions.reduce((total, submission) => total + submission.stillMissingEvidenceIds.length, 0);
  const missingTechnicalPrerequisites = expectedSubmissions.reduce((total, submission) => total + submission.missingTechnicalPrerequisiteEvidenceIds.length, 0);
  const requestPacketPolicyHash = identityRequestPacketPolicyHash();
  const requestPacketPolicyBinding = `idp:${expectedSubmissions.find((submission) => submission.decisionId === "institution-idp-approval")?.requestPacketPolicyBindingStatus ?? "missing"}|provisioning:${expectedSubmissions.find((submission) => submission.decisionId === "institution-provisioning-owner")?.requestPacketPolicyBindingStatus ?? "missing"}`;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier,
    generatedAt: input.generatedAt,
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      evidenceUrlsHashed: true
    },
    summary: {
      expectedDecisions: expectedSubmissions.length,
      verifiedDecisions,
      incompleteDecisions: expectedSubmissions.length - verifiedDecisions,
      missingProductionEvidence,
      missingTechnicalPrerequisites
    },
    expectedSubmissions,
    evidence: [
      "schema=sena-enterprise-identity-submission-verifier/v1",
      `expectedDecisions=${expectedSubmissions.length}`,
      `verifiedDecisions=${verifiedDecisions}`,
      `missingProductionEvidence=${missingProductionEvidence}`,
      `missingTechnicalPrerequisites=${missingTechnicalPrerequisites}`,
      `requestPacketPolicyHash=${requestPacketPolicyHash}`,
      `requestPacketPolicyBinding=${requestPacketPolicyBinding}`,
      "redaction=secret-values-excluded|evidence-url-values-excluded"
    ]
  };
}

function summarizeIdentityReceiptArchiveMissingInputs(
  decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"]
) {
  const counts: Partial<Record<SenaEnterpriseIdentityReceiptArchiveMissingInput, number>> = {};
  for (const decision of decisions) {
    for (const missingInput of decision.missingArchiveInputs) {
      counts[missingInput] = (counts[missingInput] ?? 0) + 1;
    }
  }
  const orderedCounts: Partial<Record<SenaEnterpriseIdentityReceiptArchiveMissingInput, number>> = {};
  for (const missingInput of identityReceiptArchiveMissingInputOrder) {
    if (counts[missingInput]) orderedCounts[missingInput] = counts[missingInput];
  }
  return orderedCounts;
}

function formatIdentityReceiptArchiveMissingInputCounts(
  counts: Partial<Record<SenaEnterpriseIdentityReceiptArchiveMissingInput, number>>
) {
  const summary = identityReceiptArchiveMissingInputOrder
    .filter((missingInput) => counts[missingInput])
    .map((missingInput) => `${missingInput}:${counts[missingInput]}`);
  return summary.join("|") || "none";
}

const identityReceiptArchiveArtifactCompletenessOrder = ["complete", "partial", "missing"] as const;

function summarizeIdentityReceiptArchiveArtifactCompleteness(
  decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"]
) {
  const counts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>> = {};
  for (const decision of decisions) {
    const status = decision.productionEvidenceArtifactDigestCompletenessStatus ?? "missing";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const orderedCounts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>> = {};
  for (const status of identityReceiptArchiveArtifactCompletenessOrder) {
    if (counts[status]) orderedCounts[status] = counts[status];
  }
  return orderedCounts;
}

function formatIdentityReceiptArchiveArtifactCompletenessCounts(
  counts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>>
) {
  return identityReceiptArchiveArtifactCompletenessOrder
    .map((status) => `${status}:${counts[status] ?? 0}`)
    .join("|");
}

function identityReceiptArchiveArtifactCompletenessReady(
  counts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>>
) {
  return (counts.complete ?? 0) === identityProductionDecisionIds.length &&
    (counts.partial ?? 0) === 0 &&
    (counts.missing ?? 0) === 0;
}

function latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(
  snapshot?: Pick<SenaEnterpriseReleaseGateReview["identityProductionSnapshot"], "receiptArchiveManifest">
) {
  return snapshot
    ? formatIdentityReceiptArchiveArtifactCompletenessCounts(snapshot.receiptArchiveManifest.summary.artifactCompletenessCounts)
    : "missing";
}

function latestReleaseGateIdentityReceiptArchiveEvidence(
  snapshot?: Pick<SenaEnterpriseReleaseGateReview["identityProductionSnapshot"], "receiptArchiveManifest">,
  prefix: "latestIdentity" | "latestReleaseGateIdentity" = "latestReleaseGateIdentity"
) {
  return [
    `${prefix}ReceiptArchiveManifestDigest=${snapshot?.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
    `${prefix}ReceiptArchiveReadyForArchive=${snapshot?.receiptArchiveManifest.summary.readyForArchive ?? "missing"}`,
    `${prefix}ReceiptArchiveReview=${snapshot?.receiptArchiveManifest.summary.reviewArchives ?? "missing"}`,
    `${prefix}ReceiptArchiveMissingReceipts=${snapshot?.receiptArchiveManifest.summary.missingReceipts ?? "missing"}`,
    `${prefix}ReceiptArchiveMissingInputs=${snapshot ? formatIdentityReceiptArchiveMissingInputCounts(snapshot.receiptArchiveManifest.summary.missingArchiveInputCounts) : "missing"}`,
    `${prefix}ReceiptArchiveArtifactCompleteness=${latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(snapshot)}`
  ];
}

function identityReceiptArchiveDecisionAuditSummaries(
  snapshot?: Pick<SenaEnterpriseReleaseGateReview["identityProductionSnapshot"], "receiptArchiveManifest">
) {
  return snapshot?.receiptArchiveManifest.decisions.map((decision) => ({
    decisionId: decision.decisionId,
    archiveStatus: decision.archiveStatus,
    ...(decision.receiptVerifierStatus ? { receiptVerifierStatus: decision.receiptVerifierStatus } : {}),
    digestHeader: decision.digestHeader,
    ...(decision.receiptAuditDigest ? { receiptAuditDigest: decision.receiptAuditDigest } : {}),
    ...(decision.receiptAuditDigestScope ? { receiptAuditDigestScope: decision.receiptAuditDigestScope } : {}),
    stableSubmissionDigestHeader: decision.stableSubmissionDigestHeader,
    ...(decision.submittedEvidenceDigest ? { submittedEvidenceDigest: decision.submittedEvidenceDigest } : {}),
    ...(decision.submittedEvidenceDigestScope ? { submittedEvidenceDigestScope: decision.submittedEvidenceDigestScope } : {}),
    ...(decision.productionEvidenceArtifactDigestAlgorithm ? {
      productionEvidenceArtifactDigestAlgorithm: decision.productionEvidenceArtifactDigestAlgorithm
    } : {}),
    ...(decision.productionEvidenceArtifactDigestScope ? {
      productionEvidenceArtifactDigestScope: decision.productionEvidenceArtifactDigestScope
    } : {}),
    ...(decision.productionEvidenceArtifactDigest ? {
      productionEvidenceArtifactDigest: decision.productionEvidenceArtifactDigest
    } : {}),
    ...(decision.productionEvidenceArtifactDigestCoveredEvidenceIds ? {
      productionEvidenceArtifactDigestCoveredEvidenceIds: decision.productionEvidenceArtifactDigestCoveredEvidenceIds
    } : {}),
    ...(decision.productionEvidenceArtifactDigestCoverageStatus ? {
      productionEvidenceArtifactDigestCoverageStatus: decision.productionEvidenceArtifactDigestCoverageStatus
    } : {}),
    ...(decision.productionEvidenceArtifactDigestCompletenessStatus ? {
      productionEvidenceArtifactDigestCompletenessStatus: decision.productionEvidenceArtifactDigestCompletenessStatus
    } : {}),
    missingArchiveInputs: decision.missingArchiveInputs
  })) ?? [];
}

function buildEnterpriseIdentityReceiptArchiveManifest(input: {
  generatedAt: string;
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"];
}): SenaEnterpriseIdentityReceiptArchiveManifest {
  if (isSelfManagedEnterpriseMode()) {
    const decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"] = identityProductionDecisionIds.map((decisionId) => ({
      decisionId,
      archiveStatus: "ready-for-archive",
      receiptVerifierStatus: "ready",
      digestHeader: identityPlatformDecisionReceiptArchivePolicy.digestHeader,
      stableSubmissionDigestHeader: identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader,
      productionEvidenceArtifactDigestCompletenessStatus: "complete",
      responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
      archiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
      missingArchiveInputs: [],
      requestPacketPolicyBindingStatus: "not-required",
      technicalBindingStatus: "not-required",
      technicalReadinessStatus: "not-required",
      evidenceUrlHostBindingStatus: "not-required",
      rotationFreshnessStatus: "ready",
      nextAction: "Institution identity production receipt archive is not applicable in self-managed enterprise mode; archive the self-managed release gate and verifier output instead."
    }));
    const artifactCompletenessCounts = { complete: decisions.length };
    const manifestCore: Omit<
      SenaEnterpriseIdentityReceiptArchiveManifest,
      "archiveManifestDigestAlgorithm" | "archiveManifestDigestScope" | "archiveManifestDigest"
    > = {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityReceiptArchiveManifest,
      generatedAt: input.generatedAt,
      redaction: {
        secretValuesExcluded: true,
        evidenceUrlValuesExcluded: true,
        ownerNamesHashed: true,
        productionEvidenceTimestampsHashed: true
      },
      archivePolicy: identityPlatformDecisionReceiptArchivePolicy,
      summary: {
        decisions: decisions.length,
        readyForArchive: decisions.length,
        reviewArchives: 0,
        missingReceipts: 0,
        missingArchiveInputCounts: {},
        artifactCompletenessCounts,
        digestHeader: identityPlatformDecisionReceiptArchivePolicy.digestHeader,
        stableSubmissionDigestHeader: identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader,
        archiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths
      },
      decisions,
      evidence: [
        "schema=sena-enterprise-identity-receipt-archive-manifest/v1",
        `receiptArchiveReadyForArchive=${decisions.length}`,
        "receiptArchiveReview=0",
        "receiptArchiveMissingReceipts=0",
        "receiptArchiveMissingInputs=none",
        `receiptArchiveArtifactCompleteness=${formatIdentityReceiptArchiveArtifactCompletenessCounts(artifactCompletenessCounts)}`,
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ],
      nextActions: []
    };
    return {
      ...manifestCore,
      archiveManifestDigestAlgorithm: "sha256",
      archiveManifestDigestScope: "identity-receipt-archive-manifest",
      archiveManifestDigest: artifactSha256({
        ...manifestCore,
        archiveManifestDigestAlgorithm: "sha256",
        archiveManifestDigestScope: "identity-receipt-archive-manifest"
      })
    };
  }
  const receiptByDecision = new Map(input.acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt.productionEvidenceReceipt]));
  const decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"] = identityProductionDecisionIds.map((decisionId) => {
    const receipt = receiptByDecision.get(decisionId);
    const missingArchiveInputs: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number]["missingArchiveInputs"] = [];
    if (!receipt) {
      missingArchiveInputs.push("productionEvidenceReceipt");
    } else {
      if (!receipt.receiptAuditDigest) missingArchiveInputs.push("receiptAuditDigest");
      if (!receipt.submittedEvidenceDigest) missingArchiveInputs.push("submittedEvidenceDigest");
      if (!receipt.productionEvidenceArtifactDigest) missingArchiveInputs.push("productionEvidenceArtifactDigest");
      if (receipt.requestPacketPolicyBindingStatus !== "current") missingArchiveInputs.push("requestPacketPolicyBinding");
      const missingSubmittedEvidenceIds = receipt.allowedEvidenceIds.filter((evidenceId) => !receipt.submittedEvidenceIds.includes(evidenceId));
      if (missingSubmittedEvidenceIds.length > 0) {
        missingArchiveInputs.push("productionEvidenceCompleteness");
      }
      if (receipt.technicalBindingStatus === "stale") missingArchiveInputs.push("technicalEvidenceBinding");
      if (receipt.technicalReadinessStatus === "review") missingArchiveInputs.push("technicalReadiness");
      if (receipt.evidenceUrlHostBindingStatus === "stale") missingArchiveInputs.push("evidenceUrlHostBinding");
      if (receipt.rotationFreshnessStatus === "review") missingArchiveInputs.push("rotationFreshness");
    }
    const archiveStatus: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number]["archiveStatus"] = !receipt
      ? "missing-receipt"
      : missingArchiveInputs.length > 0 || receipt.verifierStatus !== "ready"
        ? "review"
        : "ready-for-archive";
    const nextAction = archiveStatus === "ready-for-archive"
      ? `Archive ${decisionId} response headers and body paths with both receipt digests before release attestation.`
        : archiveStatus === "missing-receipt"
          ? `Submit ${decisionId} production evidence through /api/sena/ops/platform-decisions before receipt archive capture.`
        : missingArchiveInputs.includes("productionEvidenceArtifactDigest")
          ? `Attach ${decisionId} production evidence artifact digest before treating the platform submission as archive-ready.`
        : missingArchiveInputs.includes("requestPacketPolicyBinding")
          ? `Resolve ${decisionId} request packet policy binding by resubmitting the current request packet policy hash before receipt archive capture.`
          : missingArchiveInputs.includes("productionEvidenceCompleteness")
            ? `Complete ${decisionId} institution production evidence ids before treating the platform submission as archive-ready.`
          : missingArchiveInputs.includes("technicalEvidenceBinding")
            ? `Resolve ${decisionId} technical binding evidence before treating the platform submission as archive-ready.`
          : missingArchiveInputs.includes("technicalReadiness")
            ? `Resolve ${decisionId} technical readiness evidence before treating the platform submission as archive-ready.`
          : missingArchiveInputs.includes("evidenceUrlHostBinding")
            ? `Renew ${decisionId} evidence URL host binding before treating the platform submission as archive-ready.`
          : missingArchiveInputs.includes("rotationFreshness")
            ? `Refresh ${decisionId} rotation evidence before treating the platform submission as archive-ready.`
          : `Resolve ${decisionId} receipt verifier review before treating the platform submission as archive-ready.`;
    return {
      decisionId,
      archiveStatus,
      ...(receipt?.verifierStatus ? { receiptVerifierStatus: receipt.verifierStatus } : {}),
      digestHeader: identityPlatformDecisionReceiptArchivePolicy.digestHeader,
      ...(receipt?.receiptAuditDigest ? { receiptAuditDigest: receipt.receiptAuditDigest } : {}),
      ...(receipt?.receiptAuditDigestScope ? { receiptAuditDigestScope: receipt.receiptAuditDigestScope } : {}),
      stableSubmissionDigestHeader: identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader,
      ...(receipt?.submittedEvidenceDigest ? { submittedEvidenceDigest: receipt.submittedEvidenceDigest } : {}),
      ...(receipt?.submittedEvidenceDigestScope ? { submittedEvidenceDigestScope: receipt.submittedEvidenceDigestScope } : {}),
      ...(receipt?.productionEvidenceArtifactDigest ? {
        productionEvidenceArtifactDigestAlgorithm: receipt.productionEvidenceArtifactDigestAlgorithm,
        productionEvidenceArtifactDigestScope: receipt.productionEvidenceArtifactDigestScope,
        productionEvidenceArtifactDigest: receipt.productionEvidenceArtifactDigest,
        productionEvidenceArtifactDigestCoveredEvidenceIds: receipt.productionEvidenceArtifactDigestCoveredEvidenceIds,
        productionEvidenceArtifactDigestCoverageStatus: receipt.productionEvidenceArtifactDigestCoverageStatus,
        productionEvidenceArtifactDigestCompletenessStatus: receipt.productionEvidenceArtifactDigestCompletenessStatus
      } : {}),
      responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
      archiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
      missingArchiveInputs,
      ...(receipt?.requestPacketPolicyBindingStatus ? { requestPacketPolicyBindingStatus: receipt.requestPacketPolicyBindingStatus } : {}),
      ...(receipt?.technicalBindingStatus ? { technicalBindingStatus: receipt.technicalBindingStatus } : {}),
      ...(receipt?.technicalReadinessStatus ? { technicalReadinessStatus: receipt.technicalReadinessStatus } : {}),
      ...(receipt?.evidenceUrlHostBindingStatus ? { evidenceUrlHostBindingStatus: receipt.evidenceUrlHostBindingStatus } : {}),
      ...(receipt?.rotationFreshnessStatus ? { rotationFreshnessStatus: receipt.rotationFreshnessStatus } : {}),
      nextAction
    };
  });
  const readyForArchive = decisions.filter((decision) => decision.archiveStatus === "ready-for-archive").length;
  const missingReceipts = decisions.filter((decision) => decision.archiveStatus === "missing-receipt").length;
  const reviewArchives = decisions.filter((decision) => decision.archiveStatus === "review").length;
  const missingArchiveInputCounts = summarizeIdentityReceiptArchiveMissingInputs(decisions);
  const missingArchiveInputSummary = formatIdentityReceiptArchiveMissingInputCounts(missingArchiveInputCounts);
  const artifactCompletenessCounts = summarizeIdentityReceiptArchiveArtifactCompleteness(decisions);
  const artifactCompletenessSummary = formatIdentityReceiptArchiveArtifactCompletenessCounts(artifactCompletenessCounts);
  const manifestCore: Omit<
    SenaEnterpriseIdentityReceiptArchiveManifest,
    "archiveManifestDigestAlgorithm" | "archiveManifestDigestScope" | "archiveManifestDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityReceiptArchiveManifest,
    generatedAt: input.generatedAt,
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesHashed: true,
      productionEvidenceTimestampsHashed: true
    },
    archivePolicy: identityPlatformDecisionReceiptArchivePolicy,
    summary: {
      decisions: decisions.length,
      readyForArchive,
      reviewArchives,
      missingReceipts,
      missingArchiveInputCounts,
      artifactCompletenessCounts,
      digestHeader: identityPlatformDecisionReceiptArchivePolicy.digestHeader,
      stableSubmissionDigestHeader: identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader,
      archiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths
    },
    decisions,
    evidence: [
      "schema=sena-enterprise-identity-receipt-archive-manifest/v1",
      `receiptArchiveReadyForArchive=${readyForArchive}`,
      `receiptArchiveReview=${reviewArchives}`,
      `receiptArchiveMissingReceipts=${missingReceipts}`,
      `receiptArchiveMissingInputs=${missingArchiveInputSummary}`,
      `receiptArchiveArtifactCompleteness=${artifactCompletenessSummary}`,
      `receiptArchiveDigestHeader=${identityPlatformDecisionReceiptArchivePolicy.digestHeader}`,
      `receiptArchiveStableDigestHeader=${identityPlatformDecisionReceiptArchivePolicy.stableSubmissionDigestHeader}`,
      `receiptArchiveHeaders=${identityPlatformDecisionResponseAuditHeaders.join("|")}`,
      `receiptArchiveBodyPaths=${identityPlatformDecisionReceiptArchiveBodyPaths.join("|")}`,
      ...decisions.map((decision) => `receiptArchive:${decision.decisionId}=${decision.archiveStatus};missing=${decision.missingArchiveInputs.join("|") || "none"}`)
    ],
    nextActions: Array.from(new Set(decisions
      .filter((decision) => decision.archiveStatus !== "ready-for-archive")
      .map((decision) => decision.nextAction)))
  };
  return {
    ...manifestCore,
    archiveManifestDigestAlgorithm: "sha256",
    archiveManifestDigestScope: "identity-receipt-archive-manifest",
    archiveManifestDigest: artifactSha256({
      ...manifestCore,
      archiveManifestDigestAlgorithm: "sha256",
      archiveManifestDigestScope: "identity-receipt-archive-manifest"
    })
  };
}

const identityInstitutionActionLaneSpecs: Array<{
  id: SenaEnterpriseIdentityInstitutionActionLaneId;
  ownerRole: SenaEnterpriseIdentityInstitutionActionOwnerRole;
  decisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  cutoverItemIds: SenaEnterpriseIdentityCutoverChecklist["items"][number]["id"][];
  rotationEvidenceIds: string[];
}> = [
  {
    id: "institution-idp-owner",
    ownerRole: "Institution IdP owner",
    decisionIds: ["institution-idp-approval"],
    cutoverItemIds: ["idp-tenant-approval", "sso-secret-custody", "identity-secret-rotation"],
    rotationEvidenceIds: ["sso-secret-rotation"]
  },
  {
    id: "institution-provisioning-owner",
    ownerRole: "Institution provisioning owner",
    decisionIds: ["institution-provisioning-owner"],
    cutoverItemIds: ["scim-idp-ownership", "identity-secret-rotation"],
    rotationEvidenceIds: ["bearer-token-rotation"]
  }
];

function buildEnterpriseIdentitySubmissionMatrix(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
}): SenaEnterpriseIdentitySubmissionMatrix {
  const requestByDecision = new Map(input.platformRequestPacket.requests.map((request) => [request.decisionId, request]));
  const rowForRequirement = (
    requirement: SenaEnterpriseIdentityProductionEvidence["requirements"][number]
  ): SenaEnterpriseIdentitySubmissionMatrix["rows"][number] => {
    const lane = identityInstitutionActionLaneSpecs.find((candidate) =>
      candidate.decisionIds.includes(requirement.decisionId)
    ) ?? identityInstitutionActionLaneSpecs[0];
    const request = requestByDecision.get(requirement.decisionId);
    const submissionRequired = requirement.source === "platform-acceptance";
    const cutoverItemIds = input.cutoverChecklist.items
      .filter((item) => item.decisionIds.includes(requirement.decisionId) && item.evidenceIds.includes(requirement.id))
      .map((item) => item.id);
    const rotationEvidence = identityRotationFreshnessSpecs
      .some((spec) => spec.decisionId === requirement.decisionId && spec.id === requirement.id);
    return {
      laneId: lane.id,
      ownerRole: lane.ownerRole,
      decisionId: requirement.decisionId,
      evidenceId: requirement.id,
      label: requirement.label,
      evidenceSource: requirement.source,
      status: requirement.status,
      productionRequired: requirement.productionRequired,
      blocking: requirement.status === "missing",
      cutoverItemIds,
      submissionRequired,
      technicalPrerequisite: requirement.source === "technical-readiness",
      rotationEvidence,
      requiredBodyFields: submissionRequired
        ? [...input.platformRequestPacket.submission.identityProductionEvidenceBodyFields]
        : [],
      requiresEvidenceUrl: submissionRequired,
      requiresProductionEvidenceArtifactDigest: submissionRequired,
      requiresProductionEvidenceVerifiedAt: submissionRequired,
      ...(submissionRequired ? {
        requestPacketPolicyHash: request?.submissionTemplate.requestPacketPolicyHash ?? identityRequestPacketPolicyHash()
      } : {}),
      responseAuditHeaders: input.platformRequestPacket.submission.responseAuditHeaders,
      receiptArchiveBodyPaths: input.platformRequestPacket.submission.receiptArchivePolicy.archiveBodyPaths,
      nextAction: requirement.nextAction
    };
  };
  const rows = input.requirements.map(rowForRequirement);
  const platformEvidenceRows = rows.filter((row) => row.submissionRequired).length;
  const technicalPrerequisiteRows = rows.filter((row) => row.technicalPrerequisite).length;
  const rotationRows = rows.filter((row) => row.rotationEvidence).length;
  const requiredArtifactDigestRows = rows.filter((row) => row.requiresProductionEvidenceArtifactDigest).length;
  const requiredVerifiedAtRows = rows.filter((row) => row.requiresProductionEvidenceVerifiedAt).length;
  const requiredEvidenceUrlRows = rows.filter((row) => row.requiresEvidenceUrl).length;
  const blockingRows = rows.filter((row) => row.blocking).length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionMatrix,
    generatedAt: input.generatedAt,
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesExcluded: true,
      submissionDraftEvidenceUrlFieldOnly: true
    },
    summary: {
      rows: rows.length,
      blockingRows,
      platformEvidenceRows,
      technicalPrerequisiteRows,
      rotationRows,
      requiredArtifactDigestRows,
      requiredVerifiedAtRows,
      requiredEvidenceUrlRows
    },
    rows,
    evidence: [
      "schema=sena-enterprise-identity-submission-matrix/v1",
      `rows=${rows.length}`,
      `blockingRows=${blockingRows}`,
      `platformEvidenceRows=${platformEvidenceRows}`,
      `technicalPrerequisiteRows=${technicalPrerequisiteRows}`,
      `rotationRows=${rotationRows}`,
      `requiredArtifactDigestRows=${requiredArtifactDigestRows}`,
      `requiredVerifiedAtRows=${requiredVerifiedAtRows}`,
      `requiredEvidenceUrlRows=${requiredEvidenceUrlRows}`,
      ...rows.map((row) => `submissionMatrix:${row.laneId}:${row.decisionId}:${row.evidenceId}=${row.status};source=${row.evidenceSource};submission=${row.submissionRequired ? "required" : "not-required"}`)
    ]
  };
}

const identityOwnerRunbookPreflightSpecs: Record<
  SenaEnterpriseIdentityInstitutionActionLaneId,
  Array<{
    id: string;
    label: string;
    envVars: string[];
    evidenceIds: string[];
    nextAction: string;
  }>
> = {
  "institution-idp-owner": [
    {
      id: "idp-tenant-technical-binding",
      label: "Bind institution IdP tenant or app registration",
      envVars: ["SENA_SSO_INSTITUTION_TENANT_ID"],
      evidenceIds: ["idp-tenant-binding", "idp-tenant-approval"],
      nextAction: "Configure the institution IdP tenant/app-registration ID and attach tenant approval evidence."
    },
    {
      id: "sso-secret-custody-binding",
      label: "Bind SSO secret custody and non-secret rotation version",
      envVars: ["SENA_SSO_INSTITUTION_CLIENT_SECRET_REF", "SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION"],
      evidenceIds: ["sso-provider-secrets", "sso-secret-store-reference", "sso-client-secret-version", "sso-secret-store-binding"],
      nextAction: "Record institution secret-store custody and a non-secret SSO client-secret version binding."
    },
    {
      id: "sso-provider-preflight",
      label: "Complete institution OIDC endpoint and callback preflight",
      envVars: [
        "SENA_SSO_INSTITUTION_CLIENT_ID",
        "SENA_SSO_INSTITUTION_ISSUER",
        "SENA_SSO_INSTITUTION_AUTHORIZATION_URL",
        "SENA_SSO_INSTITUTION_TOKEN_URL",
        "SENA_SSO_INSTITUTION_USERINFO_URL",
        "SENA_SSO_INSTITUTION_JWKS_URL"
      ],
      evidenceIds: ["sso-preflight", "idp-callback-approval"],
      nextAction: "Run institution SSO preflight and attach callback/redirect approval evidence."
    },
    {
      id: "identity-secret-rotation-cadence",
      label: "Approve identity secret rotation cadence",
      envVars: ["SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"],
      evidenceIds: ["sso-secret-rotation", "identity-secret-rotation-cadence"],
      nextAction: "Record institution-approved rotation cadence and current SSO client-secret rotation evidence."
    }
  ],
  "institution-provisioning-owner": [
    {
      id: "scim-lifecycle-owner-mode",
      label: "Select SCIM, IdP, or hybrid lifecycle ownership mode",
      envVars: ["SENA_IDENTITY_LIFECYCLE_OWNER_MODE"],
      evidenceIds: ["identity-lifecycle-owner-mode", "scim-or-idp-ownership"],
      nextAction: "Configure the lifecycle owner mode and attach SCIM/IdP ownership evidence."
    },
    {
      id: "provisioning-token-custody-binding",
      label: "Bind provisioning token custody and non-secret rotation version",
      envVars: ["SENA_PROVISIONING_TOKEN_SECRET_REF", "SENA_PROVISIONING_TOKEN_VERSION"],
      evidenceIds: ["provisioning-token-secret-ref", "provisioning-token-version", "bearer-token-rotation"],
      nextAction: "Record institution secret-store custody and a non-secret provisioning token version binding."
    },
    {
      id: "provisioning-service-token",
      label: "Configure provisioning service token for SCIM bridge",
      envVars: ["SENA_PROVISIONING_TOKEN"],
      evidenceIds: ["provisioning-token", "provisioning-owner"],
      nextAction: "Configure the provisioning bearer token through the institution secret store and identify the provisioning owner."
    },
    {
      id: "identity-secret-rotation-cadence",
      label: "Approve identity secret rotation cadence",
      envVars: ["SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"],
      evidenceIds: ["bearer-token-rotation", "identity-secret-rotation-cadence"],
      nextAction: "Record institution-approved rotation cadence and current provisioning token rotation evidence."
    }
  ]
};

function buildEnterpriseIdentityOwnerRunbooks(input: {
  generatedAt: string;
  lanes: SenaEnterpriseIdentityInstitutionActionPlan["lanes"];
  submissionMatrix: SenaEnterpriseIdentitySubmissionMatrix;
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
}): SenaEnterpriseIdentityOwnerRunbooks {
  const requestByDecision = new Map(input.platformRequestPacket.requests.map((request) => [request.decisionId, request]));
  const archiveByDecision = new Map(input.receiptArchiveManifest.decisions.map((decision) => [decision.decisionId, decision]));
  const cutoverItemById = new Map(input.cutoverChecklist.items.map((item) => [item.id, item]));
  const matrixRowsByLane = (laneId: SenaEnterpriseIdentityInstitutionActionLaneId) =>
    input.submissionMatrix.rows.filter((row) => row.laneId === laneId);
  const runbooks: SenaEnterpriseIdentityOwnerRunbooks["runbooks"] = input.lanes.map((lane) => {
    const laneRows = matrixRowsByLane(lane.id);
    const laneMissingEvidenceIds = new Set([
      ...lane.missingProductionEvidenceIds,
      ...lane.missingTechnicalPrerequisiteEvidenceIds
    ]);
    const preflightChecks = identityOwnerRunbookPreflightSpecs[lane.id].map((spec) => {
      const status = spec.evidenceIds.some((evidenceId) => laneMissingEvidenceIds.has(evidenceId))
        ? "review" as const
        : "ready" as const;
      return {
        id: spec.id,
        label: spec.label,
        status,
        required: true,
        envVars: spec.envVars,
        evidenceIds: spec.evidenceIds,
        nextAction: status === "ready"
          ? `Keep ${spec.label} evidence attached to release checks.`
          : spec.nextAction
      };
    });
    const submissionSteps = lane.decisionIds.map((decisionId) => {
      const request = requestByDecision.get(decisionId);
      const decisionRows = laneRows.filter((row) => row.decisionId === decisionId && row.submissionRequired);
      return {
        decisionId,
        method: input.platformRequestPacket.submission.method,
        path: input.platformRequestPacket.submission.path,
        requiredAcceptedStatus: input.platformRequestPacket.submission.requiredAcceptedStatus,
        requiredAcceptedBridge: input.platformRequestPacket.submission.requiredAcceptedBridge,
        requiredBodyFields: input.platformRequestPacket.submission.requiredBodyFields,
        identityProductionEvidenceBodyFields: input.platformRequestPacket.submission.identityProductionEvidenceBodyFields,
        productionEvidenceIds: request?.submissionTemplate.submissionDraft.productionEvidenceIds ??
          decisionRows.map((row) => row.evidenceId),
        requestPacketPolicyHash: request?.submissionTemplate.requestPacketPolicyHash ?? identityRequestPacketPolicyHash(),
        requiresEvidenceUrl: decisionRows.some((row) => row.requiresEvidenceUrl),
        requiresProductionEvidenceArtifactDigest: decisionRows.some((row) => row.requiresProductionEvidenceArtifactDigest),
        requiresProductionEvidenceVerifiedAt: decisionRows.some((row) => row.requiresProductionEvidenceVerifiedAt),
        responseAuditHeaders: input.platformRequestPacket.submission.responseAuditHeaders
      };
    });
    const receiptArchiveSteps = lane.decisionIds.map((decisionId) => {
      const archiveDecision = archiveByDecision.get(decisionId);
      return {
        decisionId,
        archiveStatus: archiveDecision?.archiveStatus ?? "missing-receipt",
        requiredHeaders: input.platformRequestPacket.submission.receiptArchivePolicy.archiveHeaders,
        requiredBodyPaths: input.platformRequestPacket.submission.receiptArchivePolicy.archiveBodyPaths,
        missingArchiveInputs: archiveDecision?.missingArchiveInputs ?? ["productionEvidenceReceipt"]
      };
    });
    const releaseGateBlockers = Array.from(new Set([
      ...lane.cutoverItemIds.filter((itemId) => cutoverItemById.get(itemId)?.status !== "ready"),
      ...lane.missingProductionEvidenceIds,
      ...lane.missingTechnicalPrerequisiteEvidenceIds,
      ...receiptArchiveSteps.flatMap((step) => step.archiveStatus === "ready-for-archive" ? [] : [step.decisionId])
    ]));
    return {
      laneId: lane.id,
      ownerRole: lane.ownerRole,
      status: lane.status,
      decisionIds: lane.decisionIds,
      cutoverItemIds: lane.cutoverItemIds,
      missingProductionEvidenceIds: lane.missingProductionEvidenceIds,
      missingTechnicalPrerequisiteEvidenceIds: lane.missingTechnicalPrerequisiteEvidenceIds,
      rotationEvidenceIds: lane.rotationEvidenceIds,
      preflightChecks,
      submissionSteps,
      receiptArchiveSteps,
      releaseGateBlockers,
      nextActions: lane.nextActions
    };
  });
  const blockingRunbooks = runbooks.filter((runbook) => runbook.status !== "ready").length;
  const preflightChecks = runbooks.reduce((total, runbook) => total + runbook.preflightChecks.length, 0);
  const submissionSteps = runbooks.reduce((total, runbook) => total + runbook.submissionSteps.length, 0);
  const receiptArchiveSteps = runbooks.reduce((total, runbook) => total + runbook.receiptArchiveSteps.length, 0);
  const releaseGateBlockers = runbooks.reduce((total, runbook) => total + runbook.releaseGateBlockers.length, 0);
  const runbookCore: Omit<SenaEnterpriseIdentityOwnerRunbooks, "digestAlgorithm" | "digestScope" | "digest"> = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityOwnerRunbook,
    generatedAt: input.generatedAt,
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesExcluded: true,
      submissionDraftEvidenceUrlFieldOnly: true
    },
    summary: {
      lanes: runbooks.length,
      blockingRunbooks,
      preflightChecks,
      submissionSteps,
      receiptArchiveSteps,
      releaseGateBlockers
    },
    runbooks,
    evidence: [
      "schema=sena-enterprise-identity-owner-runbook/v1",
      `lanes=${runbooks.length}`,
      `blockingRunbooks=${blockingRunbooks}`,
      `preflightChecks=${preflightChecks}`,
      `submissionSteps=${submissionSteps}`,
      `receiptArchiveSteps=${receiptArchiveSteps}`,
      `releaseGateBlockers=${releaseGateBlockers}`,
      ...runbooks.map((runbook) =>
        `ownerRunbook:${runbook.laneId}=${runbook.status};preflight=${runbook.preflightChecks.length};submission=${runbook.submissionSteps.length};archive=${runbook.receiptArchiveSteps.length};blockers=${runbook.releaseGateBlockers.join("|") || "none"}`
      )
    ]
  };
  return {
    ...runbookCore,
    digestAlgorithm: "sha256",
    digestScope: "identity-owner-runbook",
    digest: artifactSha256({
      ...runbookCore,
      digestAlgorithm: "sha256",
      digestScope: "identity-owner-runbook"
    })
  };
}

function buildEnterpriseIdentityInstitutionActionPlan(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
}): SenaEnterpriseIdentityInstitutionActionPlan {
  const uniqueStrings = (values: string[]) => Array.from(new Set(values));
  const requestByDecision = new Map(input.platformRequestPacket.requests.map((request) => [request.decisionId, request]));
  const cutoverItemById = new Map(input.cutoverChecklist.items.map((item) => [item.id, item]));
  const receiptArchiveByDecision = new Map(input.receiptArchiveManifest.decisions.map((decision) => [decision.decisionId, decision]));
  const submissionMatrix = buildEnterpriseIdentitySubmissionMatrix({
    generatedAt: input.generatedAt,
    requirements: input.requirements,
    platformRequestPacket: input.platformRequestPacket,
    cutoverChecklist: input.cutoverChecklist
  });
  const lanes: SenaEnterpriseIdentityInstitutionActionPlan["lanes"] = identityInstitutionActionLaneSpecs.map((spec) => {
    const requests = spec.decisionIds
      .map((decisionId) => requestByDecision.get(decisionId))
      .filter((request): request is SenaEnterpriseIdentityPlatformDecisionRequestPacket["requests"][number] => Boolean(request));
    const cutoverItems = spec.cutoverItemIds
      .map((itemId) => cutoverItemById.get(itemId))
      .filter((item): item is SenaEnterpriseIdentityCutoverChecklist["items"][number] => Boolean(item));
    const receiptArchiveDecisions = spec.decisionIds
      .map((decisionId) => receiptArchiveByDecision.get(decisionId))
      .filter((decision): decision is SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number] => Boolean(decision));
    const missingProductionEvidenceIds = uniqueStrings(requests.flatMap((request) => request.missingProductionEvidenceIds));
    const missingTechnicalPrerequisiteEvidenceIds = uniqueStrings(requests.flatMap((request) => request.missingTechnicalPrerequisiteEvidenceIds));
    const rotationExpiredEvidenceIds = uniqueStrings(requests.flatMap((request) => request.latestReceiptRotationExpiredEvidenceIds ?? []));
    const rotationDueSoonEvidenceIds = uniqueStrings(requests.flatMap((request) => request.latestReceiptRotationDueSoonEvidenceIds ?? []));
    const requestPacketPolicyBindingStatuses = requests.map((request) =>
      request.latestReceiptRequestPacketPolicyBindingStatus ?? "missing"
    );
    const receiptArchiveStatuses = receiptArchiveDecisions.map((decision) => decision.archiveStatus);
    const artifactCompletenessStatuses = receiptArchiveDecisions.map((decision) =>
      decision.productionEvidenceArtifactDigestCompletenessStatus ?? "missing"
    );
    const blocking = requests.some((request) => request.blocking) ||
      cutoverItems.some((item) => item.status !== "ready") ||
      receiptArchiveStatuses.some((status) => status !== "ready-for-archive") ||
      artifactCompletenessStatuses.some((status) => status !== "complete");
    const nextActions = uniqueStrings([
      ...requests.flatMap((request) => request.nextActions),
      ...cutoverItems.flatMap((item) => item.status === "ready" ? [] : item.nextActions),
      ...receiptArchiveDecisions.flatMap((decision) => decision.archiveStatus === "ready-for-archive" ? [] : [decision.nextAction])
    ]);
    return {
      id: spec.id,
      ownerRole: spec.ownerRole,
      status: blocking ? "review" : "ready",
      blocking,
      decisionIds: spec.decisionIds,
      cutoverItemIds: spec.cutoverItemIds,
      missingProductionEvidenceIds,
      missingTechnicalPrerequisiteEvidenceIds,
      rotationEvidenceIds: spec.rotationEvidenceIds,
      rotationExpiredEvidenceIds,
      rotationDueSoonEvidenceIds,
      requestPacketPolicyBindingStatuses,
      receiptArchiveStatuses,
      artifactCompletenessStatuses,
      submissionDrafts: requests.map((request) => ({
        decisionId: request.decisionId,
        submissionDraft: {
          teamId: request.submissionTemplate.submissionDraft.teamId,
          decisionId: request.submissionTemplate.submissionDraft.decisionId,
          status: request.submissionTemplate.submissionDraft.status,
          acceptedBridge: request.submissionTemplate.submissionDraft.acceptedBridge,
          ownerName: request.submissionTemplate.submissionDraft.ownerName,
          ownerRole: request.submissionTemplate.submissionDraft.ownerRole,
          environment: request.submissionTemplate.submissionDraft.environment,
          evidenceUrlField: "evidenceUrl",
          productionEvidenceIds: request.submissionTemplate.submissionDraft.productionEvidenceIds,
          productionEvidenceArtifactDigest: request.submissionTemplate.submissionDraft.productionEvidenceArtifactDigest,
          productionEvidenceVerifiedAt: request.submissionTemplate.submissionDraft.productionEvidenceVerifiedAt,
          requestPacketPolicyHash: request.submissionTemplate.submissionDraft.requestPacketPolicyHash,
          notesTemplate: request.submissionTemplate.notesTemplate
        }
      })),
      responseAuditHeaders: input.platformRequestPacket.submission.responseAuditHeaders,
      receiptArchiveBodyPaths: input.platformRequestPacket.submission.receiptArchivePolicy.archiveBodyPaths,
      nextActions: nextActions.length > 0
        ? nextActions
        : [`Keep ${spec.ownerRole} production evidence archived with the identity release gate.`]
    };
	  });
  const ownerRunbooks = buildEnterpriseIdentityOwnerRunbooks({
    generatedAt: input.generatedAt,
    lanes,
    submissionMatrix,
    platformRequestPacket: input.platformRequestPacket,
    cutoverChecklist: input.cutoverChecklist,
    receiptArchiveManifest: input.receiptArchiveManifest
  });
	  const blockingLanes = lanes.filter((lane) => lane.blocking).length;
	  const rotationReviewLanes = lanes.filter((lane) =>
	    lane.rotationEvidenceIds.some((evidenceId) =>
      lane.missingProductionEvidenceIds.includes(evidenceId) ||
      lane.missingTechnicalPrerequisiteEvidenceIds.includes(evidenceId) ||
      lane.rotationExpiredEvidenceIds.includes(evidenceId) ||
      lane.rotationDueSoonEvidenceIds.includes(evidenceId)
    )
  ).length;
  const planCore: Omit<
    SenaEnterpriseIdentityInstitutionActionPlan,
    "digestAlgorithm" | "digestScope" | "digest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityInstitutionActionPlan,
    generatedAt: input.generatedAt,
    status: blockingLanes === 0 ? "ready" : "review",
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesExcluded: true,
      submissionDraftEvidenceUrlFieldOnly: true
    },
    summary: {
      lanes: lanes.length,
      blockingLanes,
      readyLanes: lanes.length - blockingLanes,
      missingProductionEvidence: lanes.reduce((total, lane) => total + lane.missingProductionEvidenceIds.length, 0),
      missingTechnicalPrerequisites: lanes.reduce((total, lane) => total + lane.missingTechnicalPrerequisiteEvidenceIds.length, 0),
      rotationReviewLanes,
      cutoverBlockingItems: input.cutoverChecklist.summary.blockingItems,
      submissionPath: input.platformRequestPacket.submission.path
	    },
	    lanes,
	    submissionMatrix,
    ownerRunbooks,
	    evidence: [
	      "schema=sena-enterprise-identity-institution-action-plan/v1",
	      `lanes=${lanes.length}`,
      `blockingLanes=${blockingLanes}`,
      `readyLanes=${lanes.length - blockingLanes}`,
      `missingProductionEvidence=${lanes.reduce((total, lane) => total + lane.missingProductionEvidenceIds.length, 0)}`,
      `missingTechnicalPrerequisites=${lanes.reduce((total, lane) => total + lane.missingTechnicalPrerequisiteEvidenceIds.length, 0)}`,
	      `rotationReviewLanes=${rotationReviewLanes}`,
	      `submissionMatrix=${submissionMatrix.schemaVersion}`,
	      `submissionMatrixRows=${submissionMatrix.summary.rows}`,
	      `submissionMatrixBlockingRows=${submissionMatrix.summary.blockingRows}`,
      `ownerRunbooks=${ownerRunbooks.schemaVersion}`,
      `ownerRunbookBlocking=${ownerRunbooks.summary.blockingRunbooks}`,
      `ownerRunbookPreflightChecks=${ownerRunbooks.summary.preflightChecks}`,
      `ownerRunbookSubmissionSteps=${ownerRunbooks.summary.submissionSteps}`,
      `ownerRunbookReceiptArchiveSteps=${ownerRunbooks.summary.receiptArchiveSteps}`,
	      `submissionPath=${input.platformRequestPacket.submission.path}`,
	      "redaction=secret-values-excluded|evidence-url-values-excluded|owner-names-excluded",
      ...ownerRunbooks.evidence,
	      ...lanes.map((lane) => `lane:${lane.id}=${lane.status};missing=${lane.missingProductionEvidenceIds.join("|") || "none"};technical=${lane.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none"}`)
	    ],
    nextActions: uniqueStrings(lanes.flatMap((lane) => lane.nextActions))
  };
  return {
    ...planCore,
    digestAlgorithm: "sha256",
    digestScope: "identity-institution-action-plan",
    digest: artifactSha256({
      ...planCore,
      digestAlgorithm: "sha256",
      digestScope: "identity-institution-action-plan"
    })
  };
}

function identityProductionEvidenceBindingDigest(
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"]
) {
  const receiptByDecision = new Map(acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  return artifactSha256({
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    evidenceBindingDigestAlgorithm: "sha256",
    evidenceBindingDigestScope: "identity-production-evidence-binding",
    decisions: identityProductionDecisionIds.map((decisionId) => {
      const receipt = receiptByDecision.get(decisionId);
      const productionEvidenceReceipt = receipt?.productionEvidenceReceipt;
      return {
        decisionId,
        status: receipt?.status ?? "missing",
        acceptedBridge: receipt?.acceptedBridge ?? false,
        submittedEvidenceDigest: productionEvidenceReceipt?.submittedEvidenceDigest ?? "missing",
        productionEvidenceArtifactDigestAlgorithm: productionEvidenceReceipt?.productionEvidenceArtifactDigestAlgorithm ?? "missing",
        productionEvidenceArtifactDigestScope: productionEvidenceReceipt?.productionEvidenceArtifactDigestScope ?? "missing",
        productionEvidenceArtifactDigest: productionEvidenceReceipt?.productionEvidenceArtifactDigest ?? "missing",
        productionEvidenceArtifactDigestCoveredEvidenceIds: productionEvidenceReceipt?.productionEvidenceArtifactDigestCoveredEvidenceIds ?? [],
        productionEvidenceArtifactDigestCoverageStatus: productionEvidenceReceipt?.productionEvidenceArtifactDigestCoverageStatus ?? "missing",
        productionEvidenceArtifactDigestCompletenessStatus: productionEvidenceReceipt?.productionEvidenceArtifactDigestCompletenessStatus ?? "missing",
        verifierStatus: productionEvidenceReceipt?.verifierStatus ?? "missing",
        requestPacketPolicyBindingStatus: productionEvidenceReceipt?.requestPacketPolicyBindingStatus ?? "missing",
        technicalBindingStatus: productionEvidenceReceipt?.technicalBindingStatus ?? "missing",
        technicalReadinessStatus: productionEvidenceReceipt?.technicalReadinessStatus ?? "missing",
        evidenceUrlHostBindingStatus: productionEvidenceReceipt?.evidenceUrlHostBindingStatus ?? "missing",
        rotationFreshnessStatus: productionEvidenceReceipt?.rotationFreshnessStatus ?? "missing",
        rotationExpiredEvidenceIds: productionEvidenceReceipt?.rotationExpiredEvidenceIds ?? [],
        rotationDueSoonEvidenceIds: productionEvidenceReceipt?.rotationDueSoonEvidenceIds ?? []
      };
    })
  });
}

function buildEnterpriseIdentityProductionEvidenceDossier(input: {
  generatedAt?: string;
  teamId?: string;
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  authCapability?: SenaEnterpriseCapabilityAuditItem;
  requireAuthCapabilityReady?: boolean;
}): SenaEnterpriseIdentityProductionEvidence {
  const latestIdentityAcceptances = latestPlatformDecisionAcceptances(input.platformDecisionAcceptances);
  const decisions = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .map((decision) => ({
      id: decision.id as SenaEnterpriseIdentityProductionDecisionId,
      label: decision.label,
      status: decision.status,
      productionBlocking: decision.productionBlocking,
      acceptedBridge: decision.acceptedBridge,
      ownerEvidence: decision.ownerEvidence,
      acceptanceCriteria: decision.acceptanceCriteria
    }));
  const acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"] = identityProductionDecisionIds
    .flatMap((decisionId) => {
      const acceptance = latestIdentityAcceptances.get(decisionId);
      if (!acceptance) return [];
      const productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance) ?? acceptance.productionEvidenceReceipt;
      return [{
        decisionId,
        status: acceptance.status,
        acceptedBridge: acceptance.acceptedBridge,
        ownerNameHash: sha256Text(acceptance.ownerName),
        ...(acceptance.productionEvidenceVerifiedAt ? {
          productionEvidenceVerifiedAtHash: sha256Text(acceptance.productionEvidenceVerifiedAt)
        } : {}),
        ownerRole: acceptance.ownerRole,
        environment: acceptance.environment,
        ...(acceptance.evidenceUrlHash ? { evidenceUrlHash: acceptance.evidenceUrlHash } : {}),
        ...(acceptance.evidenceUrlPathHash ? { evidenceUrlPathHash: acceptance.evidenceUrlPathHash } : {}),
        ...(acceptance.evidenceUrlHostHash ? { evidenceUrlHostHash: acceptance.evidenceUrlHostHash } : {}),
        ...(acceptance.evidenceUrlAllowedHostHash ? { evidenceUrlAllowedHostHash: acceptance.evidenceUrlAllowedHostHash } : {}),
        ...(productionEvidenceReceipt ? { productionEvidenceReceipt } : {}),
        updatedAt: acceptance.updatedAt
      }];
    });
  const requirements = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .flatMap((decision) =>
      decision.evidenceChecklist
        .filter((item) => item.productionRequired)
        .map((item) => ({
          id: item.id,
          decisionId: decision.id as SenaEnterpriseIdentityProductionDecisionId,
          label: item.label,
          status: item.status,
          productionRequired: item.productionRequired,
          source: item.source,
          evidence: item.evidence,
          nextAction: item.nextAction
        }))
    );
  const productionRequirements = requirements.filter((requirement) => requirement.productionRequired);
  const missingRequirements = productionRequirements.filter((requirement) => requirement.status === "missing");
  const uniqueEvidenceIds = (values: string[]) => Array.from(new Set(values));
  const acceptanceReceiptByDecision = new Map(acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  const evidenceManifest: SenaEnterpriseIdentityProductionEvidence["evidenceManifest"] = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidenceManifest,
    requiredEvidenceIds: uniqueEvidenceIds(productionRequirements.map((requirement) => requirement.id)),
    acceptedEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.id)),
    presentEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.status === "present")
      .map((requirement) => requirement.id)),
    missingEvidenceIds: uniqueEvidenceIds(missingRequirements.map((requirement) => requirement.id)),
    platformAcceptanceEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.source === "platform-acceptance")
      .map((requirement) => requirement.id)),
    technicalReadinessEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.source === "technical-readiness")
      .map((requirement) => requirement.id)),
    byDecision: identityProductionDecisionIds.map((decisionId) => {
      const decisionRequirements = productionRequirements.filter((requirement) => requirement.decisionId === decisionId);
      return {
        decisionId,
        requiredEvidenceIds: uniqueEvidenceIds(decisionRequirements.map((requirement) => requirement.id)),
        acceptedEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "accepted")
          .map((requirement) => requirement.id)),
        presentEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "present")
          .map((requirement) => requirement.id)),
        missingEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "missing")
          .map((requirement) => requirement.id))
      };
    })
  };
  const productionBlockingDecisionIds = identityProductionDecisionIds.filter((decisionId) => {
    const decision = input.platformDecisionRegister.decisions.find((candidate) => candidate.id === decisionId);
    if (!decision) return true;
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      requirements.some((requirement) => requirement.decisionId === decisionId && requirement.status === "missing") ||
      acceptanceReceiptByDecision.get(decisionId)?.productionEvidenceReceipt?.verifierStatus === "review"
    );
  });
  const generatedAt = input.generatedAt ?? now();
  const rotationFreshness = buildEnterpriseIdentityRotationFreshness(latestIdentityAcceptances, generatedAt);
  const evidenceUrlHostBinding = buildEnterpriseIdentityEvidenceUrlHostBinding(latestIdentityAcceptances);
  const platformRequestPacket = buildEnterpriseIdentityPlatformDecisionRequestPacket({
    teamId: input.teamId,
    generatedAt,
    decisions,
    requirements,
    acceptanceReceipts
  });
  const submissionVerifier = buildEnterpriseIdentitySubmissionVerifier({
    generatedAt,
    requirements,
    acceptanceReceipts
  });
  const receiptArchiveManifest = buildEnterpriseIdentityReceiptArchiveManifest({
    generatedAt,
    acceptanceReceipts
  });
  const evidenceBindingDigest = identityProductionEvidenceBindingDigest(acceptanceReceipts);
  const cutoverChecklist = buildEnterpriseIdentityCutoverChecklist({
    generatedAt,
    requirements,
    acceptanceReceipts
  });
  const institutionActionPlan = buildEnterpriseIdentityInstitutionActionPlan({
    generatedAt,
    requirements,
    platformRequestPacket,
    cutoverChecklist,
    receiptArchiveManifest
  });
  const receiptArchiveReady = receiptArchiveManifest.summary.readyForArchive === identityProductionDecisionIds.length &&
    receiptArchiveManifest.summary.reviewArchives === 0 &&
    receiptArchiveManifest.summary.missingReceipts === 0;
  const receiptArchiveArtifactCompletenessReady = identityReceiptArchiveArtifactCompletenessReady(
    receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  const authCapabilityReady = !input.requireAuthCapabilityReady || input.authCapability?.status === "ready";
  const identityProductionReleaseGateBlocked = productionBlockingDecisionIds.length > 0 ||
    submissionVerifier.summary.incompleteDecisions > 0 ||
    submissionVerifier.summary.missingProductionEvidence > 0 ||
    submissionVerifier.summary.missingTechnicalPrerequisites > 0 ||
    cutoverChecklist.status !== "ready" ||
    rotationFreshness.status !== "ready" ||
    evidenceUrlHostBinding.status !== "ready" ||
    !receiptArchiveArtifactCompletenessReady ||
    !receiptArchiveReady;
  const status: SenaEnterpriseIdentityProductionEvidence["status"] = !identityProductionReleaseGateBlocked && authCapabilityReady
    ? "ready"
    : "review";
  const capabilityStatus = input.teamId ? status : input.authCapability?.status ?? status;
  const nextActions = Array.from(new Set(
    missingRequirements.length > 0
      ? missingRequirements.map((requirement) => requirement.nextAction)
      : [input.authCapability?.nextAction ?? "Keep institution identity evidence attached to release checks."]
  ));

  const dossierCore: Omit<
    SenaEnterpriseIdentityProductionEvidence,
    "dossierDigestAlgorithm" | "dossierDigestScope" | "dossierDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    generatedAt,
    status,
    evidenceBindingDigestAlgorithm: "sha256",
    evidenceBindingDigestScope: "identity-production-evidence-binding",
    evidenceBindingDigest,
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      evidenceUrlsHashed: true,
      ownerNamesHashed: true,
      productionEvidenceTimestampsHashed: true
    },
    summary: {
      productionRequired: productionRequirements.length,
      accepted: productionRequirements.filter((requirement) => requirement.status === "accepted").length,
      present: productionRequirements.filter((requirement) => requirement.status === "present").length,
      missing: missingRequirements.length,
      platformBlocking: missingRequirements.filter((requirement) => requirement.source === "platform-acceptance").length,
      technicalBlocking: missingRequirements.filter((requirement) => requirement.source === "technical-readiness").length
    },
    capability: {
      id: input.authCapability?.id ?? "auth-login-register-sso",
      status: capabilityStatus,
      evidence: input.teamId
        ? [
            "capabilityAudit=team-scoped-identity-production-evidence",
            `teamId=${input.teamId}`,
            `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
            `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`
          ]
        : input.authCapability?.evidence ?? [
            "capabilityAudit=deployment-identity-production-handoff",
            `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
            `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`
          ],
      remainingPlatformDecisions: input.teamId
        ? productionBlockingDecisionIds
        : input.authCapability?.remainingPlatformDecisions ?? productionBlockingDecisionIds,
      nextAction: input.authCapability?.nextAction ?? "Complete institution identity production evidence before release approval."
    },
    decisions,
    acceptanceReceipts,
    requirements,
    evidenceManifest,
    releaseGate: {
      approvalBlocked: identityProductionReleaseGateBlocked || !authCapabilityReady,
      productionBlockingDecisionIds,
      missingProductionEvidence: missingRequirements.map((requirement) => ({
        decisionId: requirement.decisionId,
        evidenceId: requirement.id,
        label: requirement.label,
        status: requirement.status,
        source: requirement.source,
        nextAction: requirement.nextAction
      }))
    },
    rotationFreshness,
    evidenceUrlHostBinding,
    cutoverChecklist,
    platformRequestPacket,
    submissionVerifier,
    receiptArchiveManifest,
    institutionActionPlan,
    evidence: [
      "schema=sena-enterprise-identity-production-evidence/v1",
      `status=${status}`,
      `authCapability=${capabilityStatus}`,
      `scope=${input.teamId ? `team:${input.teamId}` : "global"}`,
      ...(isSelfManagedEnterpriseMode() ? [
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ] : []),
      `evidenceBindingDigest=${evidenceBindingDigest}`,
      `productionRequired=${productionRequirements.length}`,
      `missing=${missingRequirements.length}`,
      `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`,
      `identityProductionBlockingDecisions=${productionBlockingDecisionIds.join("|") || "none"}`,
      `platformRequestPacket=${platformRequestPacket.schemaVersion}`,
      `platformRequestBlocking=${platformRequestPacket.summary.blockingRequests}`,
      `submissionVerifier=${submissionVerifier.schemaVersion}`,
      `submissionVerifierMissing=${submissionVerifier.summary.missingProductionEvidence}`,
      `submissionVerifierMissingTechnical=${submissionVerifier.summary.missingTechnicalPrerequisites}`,
      `receiptArchiveManifest=${receiptArchiveManifest.schemaVersion}`,
      `receiptArchiveReadyForArchive=${receiptArchiveManifest.summary.readyForArchive}`,
      `receiptArchiveReview=${receiptArchiveManifest.summary.reviewArchives}`,
      `receiptArchiveMissingReceipts=${receiptArchiveManifest.summary.missingReceipts}`,
      `receiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      `receiptArchiveArtifactCompleteness=${formatIdentityReceiptArchiveArtifactCompletenessCounts(receiptArchiveManifest.summary.artifactCompletenessCounts)}`,
      `receiptArchiveHeaders=${receiptArchiveManifest.archivePolicy.archiveHeaders.join("|")}`,
      `institutionActionPlan=${institutionActionPlan.schemaVersion}`,
      `institutionActionPlanDigest=${institutionActionPlan.digest ?? "missing"}`,
      `institutionActionPlanBlockingLanes=${institutionActionPlan.summary.blockingLanes}`,
      `rotationFreshness=${rotationFreshness.status}`,
      `rotationExpired=${rotationFreshness.checks.filter((check) => check.status === "expired").map((check) => check.id).join("|") || "none"}`,
      `evidenceUrlHostBinding=${evidenceUrlHostBinding.status}`,
      `evidenceUrlHostBindingStale=${evidenceUrlHostBinding.staleDecisionIds.join("|") || "none"}`,
      `cutoverChecklist=${cutoverChecklist.status}`,
      `cutoverBlockers=${cutoverChecklist.summary.blockingItems}`,
      "redaction=owner-names-hashed|production-evidence-timestamps-hashed",
      "redaction=secret-values-excluded",
      "evidenceUrls=hashed"
    ],
    nextActions: Array.from(new Set([
      ...nextActions,
      ...institutionActionPlan.nextActions,
      ...receiptArchiveManifest.nextActions,
      ...rotationFreshness.nextActions,
      ...(evidenceUrlHostBinding.status === "ready"
        ? []
        : [`Renew institution identity evidence URLs for ${[...evidenceUrlHostBinding.staleDecisionIds, ...evidenceUrlHostBinding.missingDecisionIds].join(", ")} so accepted evidence hosts match the current allowlist.`])
    ]))
  };
  return {
    ...dossierCore,
    dossierDigestAlgorithm: "sha256",
    dossierDigestScope: "identity-production-evidence-dossier",
    dossierDigest: artifactSha256({
      ...dossierCore,
      dossierDigestAlgorithm: "sha256",
      dossierDigestScope: "identity-production-evidence-dossier"
    })
  };
}

export function getEnterpriseIdentityProductionEvidence(input: { teamId?: string } = {}): SenaEnterpriseIdentityProductionEvidence {
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const audit = getEnterpriseCapabilityAudit();
  const authCapability = audit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const platformDecisionRegister = input.teamId
    ? buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances)
    : deployment.platformDecisionRegister;
  return buildEnterpriseIdentityProductionEvidenceDossier({
    teamId: input.teamId,
    platformDecisionRegister,
    platformDecisionAcceptances,
    authCapability,
    requireAuthCapabilityReady: !input.teamId
  });
}

export function createEnterpriseReleaseGateReview(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseReleaseGateReviewInput
): SenaEnterpriseReleaseGateReview {
  if (!isEnterpriseReleaseGateDecision(input.decision)) {
    throw new SenaEnterpriseError("Release gate decision is not recognized.", 400, "invalid_release_gate_decision");
  }
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const readiness = getEnterpriseDeploymentReadiness();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const teamPlatformDecisionAcceptances = (db.platformDecisionAcceptances ?? [])
    .filter((acceptance) => acceptance.teamId === input.teamId);
  const teamPlatformDecisionRegister = buildEnterprisePlatformDecisionRegister(
    deployment.platformDecisions,
    teamPlatformDecisionAcceptances
  );
  const verificationCommand = requiredReleaseGateText(input.verificationCommand, "verificationCommand");
  if (!readiness.runbook.verificationCommands.includes(verificationCommand)) {
    throw new SenaEnterpriseError("Release gate verification command must match the deployment readiness runbook.", 400, "release_gate_verification_command_required");
  }

  const timestamp = now();
  const identityProductionSnapshot = enterpriseReleaseGateIdentityProductionSnapshot({
    generatedAt: timestamp,
    teamId: input.teamId,
    platformDecisionRegister: teamPlatformDecisionRegister,
    platformDecisionAcceptances: teamPlatformDecisionAcceptances
  });
  const identityProductionSnapshotRequestPacketEvidence = (sourceKey: string) => identityProductionSnapshot.platformRequestPacket.evidence
    .find((item) => item.startsWith(`${sourceKey}=`))
    ?.slice(sourceKey.length + 1);
  const verificationEvidence = normalizeReleaseVerificationEvidence(
    input.verificationEvidence,
    verificationCommand,
    timestamp,
    "Release gate reviewer did not attach verification output evidence."
  );
  if (input.decision === "approved") {
    const approvalBlockers = [
      verificationEvidence.status === "passed" ? null : "release-verification-passed-required",
      readiness.summary.blockingReview === 0 ? null : "deployment-readiness-blocking-review",
      teamPlatformDecisionRegister.summary.productionBlocking === 0 ? null : "team-scoped platform decisions production blockers",
      identityProductionSnapshot.status === "ready" && !identityProductionSnapshot.releaseGateBlocked ? null : "team-scoped identity-production-evidence-required",
      identityProductionSnapshot.submissionVerifier.incompleteDecisions === 0 ? null : "team-scoped identity-submission-verifier-complete-required",
      identityProductionSnapshot.submissionVerifier.missingProductionEvidence === 0 ? null : "team-scoped identity-submission-verifier-evidence-required",
      identityProductionSnapshot.submissionVerifier.missingTechnicalPrerequisites === 0 ? null : "team-scoped identity-submission-verifier-technical-prerequisites-required",
      identityProductionSnapshot.cutoverChecklist.status === "ready" ? null : "team-scoped identity-cutover-checklist-required",
      identityProductionSnapshot.rotationFreshness.status === "ready" ? null : "team-scoped identity-rotation-freshness-required",
      identityProductionSnapshot.evidenceUrlHostBinding.status === "ready" ? null : "team-scoped identity-evidence-host-binding-required",
      identityReceiptArchiveArtifactCompletenessReady(identityProductionSnapshot.receiptArchiveManifest.summary.artifactCompletenessCounts)
        ? null
        : "team-scoped identity-production-evidence-artifact-completeness-required",
      identityProductionSnapshot.receiptArchiveManifest.summary.readyForArchive === identityProductionDecisionIds.length &&
        identityProductionSnapshot.receiptArchiveManifest.summary.reviewArchives === 0 &&
        identityProductionSnapshot.receiptArchiveManifest.summary.missingReceipts === 0
        ? null
        : "team-scoped identity-receipt-archive-ready-required"
    ].filter((blocker): blocker is string => Boolean(blocker));
    if (approvalBlockers.length > 0) {
      throw new SenaEnterpriseError(
        `Release gate approval requires zero production blockers and passed verification: ${approvalBlockers.join(", ")}.`,
        409,
        "release_gate_approval_blocked"
      );
    }
  }
  const review: SenaEnterpriseReleaseGateReview = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview,
    id: id("release-gate"),
    teamId: input.teamId,
    environment: requiredReleaseGateText(input.environment, "environment"),
    releaseVersion: requiredReleaseGateText(input.releaseVersion, "releaseVersion"),
    decision: input.decision,
    status: input.decision,
    approverName: requiredReleaseGateText(input.approverName, "approverName"),
    approverRole: requiredReleaseGateText(input.approverRole, "approverRole"),
    notes: requiredReleaseGateText(input.notes, "notes"),
    verificationCommand,
    verificationEvidence,
    readinessSnapshot: {
      schemaVersion: readiness.schemaVersion,
      generatedAt: readiness.generatedAt,
      status: readiness.status,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview,
      blockers: readiness.summary.blockers
    },
    platformDecisionSnapshot: enterpriseReleaseGatePlatformDecisionSnapshot(teamPlatformDecisionRegister),
    identityProductionSnapshot,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.releaseGateReviews.unshift(review);
  db.releaseGateReviews = db.releaseGateReviews.slice(0, 1000);
  appendAudit(db, {
    event: "ops.release_gate.review",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      releaseGateReviewId: review.id,
      decision: review.decision,
      environment: review.environment,
      releaseVersion: review.releaseVersion,
      verificationCommand: review.verificationCommand,
      verificationStatus: review.verificationEvidence.status,
      verificationEvidenceSha256: review.verificationEvidence.outputSha256,
      blockingReview: review.readinessSnapshot.blockingReview,
      advisoryReview: review.readinessSnapshot.advisoryReview,
      productionBlocking: review.platformDecisionSnapshot.productionBlocking,
      acceptedBridge: review.platformDecisionSnapshot.acceptedBridge,
      identityProductionStatus: review.identityProductionSnapshot.status,
      identityProductionMissingEvidence: review.identityProductionSnapshot.missingEvidenceIds.length,
      identitySubmissionVerifierIncomplete: review.identityProductionSnapshot.submissionVerifier.incompleteDecisions,
      identitySubmissionVerifierMissing: review.identityProductionSnapshot.submissionVerifier.missingProductionEvidence,
      identitySubmissionVerifierMissingTechnical: review.identityProductionSnapshot.submissionVerifier.missingTechnicalPrerequisites,
      identityRotationFreshness: review.identityProductionSnapshot.rotationFreshness.status,
      identityProductionEvidenceDigest: review.identityProductionSnapshot.dossierDigest ?? "missing",
      identityEvidenceBindingDigest: review.identityProductionSnapshot.evidenceBindingDigest ?? "missing",
      identityReceiptArchiveManifestDigest: review.identityProductionSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      identityReceiptArchiveReadyForArchive: review.identityProductionSnapshot.receiptArchiveManifest.summary.readyForArchive,
      identityReceiptArchiveReview: review.identityProductionSnapshot.receiptArchiveManifest.summary.reviewArchives,
      identityReceiptArchiveMissingReceipts: review.identityProductionSnapshot.receiptArchiveManifest.summary.missingReceipts,
      identityReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(review.identityProductionSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
      identityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(review.identityProductionSnapshot),
      identityReceiptArchiveDecisions: JSON.stringify(identityReceiptArchiveDecisionAuditSummaries(review.identityProductionSnapshot)),
      identityRequestPacketPolicyHash: identityProductionSnapshotRequestPacketEvidence("requestPacketPolicyHash") ?? "missing",
      identityRequestPacketPolicyBinding: identityProductionSnapshotRequestPacketEvidence("requestPacketPolicyBinding") ?? "missing",
      identityEvidenceUrlHostBinding: review.identityProductionSnapshot.evidenceUrlHostBinding.status,
      identityEvidenceAllowedHostConfig: review.identityProductionSnapshot.evidenceUrlHostBinding.allowedHostConfigStatus,
      identityEvidenceAllowedHosts: review.identityProductionSnapshot.evidenceUrlHostBinding.allowedHostCount,
      identityEvidenceInvalidAllowedHosts: review.identityProductionSnapshot.evidenceUrlHostBinding.invalidAllowedHostCount
    }
  });
  saveDb(db);
  return review;
}

export function listEnterpriseReleaseGateReviews(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseReleaseGateReviewList {
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for release gate reviews.", 403, "release_gate_permission_denied");
  }
  const teamIdSet = new Set(teamIds);
  const reviews = (readEnterpriseDb().releaseGateReviews ?? [])
    .filter((review) => teamIdSet.has(review.teamId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizeReleaseGateReviews(reviews),
    reviews
  };
}

function auditTimestamp(value?: string) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new SenaEnterpriseError("Audit date filters must be valid ISO timestamps.", 400, "invalid_audit_date");
  }
  return timestamp;
}

function auditRetentionWindowDays() {
  const value = process.env.SENA_AUDIT_RETENTION_DAYS;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SenaEnterpriseError("SENA_AUDIT_RETENTION_DAYS must be a positive number of days.", 500, "invalid_audit_retention_days");
  }
  return Math.trunc(parsed);
}

function sortedAuditDetail(detail: SenaEnterpriseAuditLogEntry["detail"]) {
  return Object.fromEntries(Object.entries(detail).sort(([left], [right]) => left.localeCompare(right)));
}

function auditEntryHash(entry: SenaEnterpriseAuditLogEntry) {
  return createHash("sha256").update(JSON.stringify({
    id: entry.id,
    event: entry.event,
    userId: entry.userId ?? null,
    teamId: entry.teamId ?? null,
    projectId: entry.projectId ?? null,
    createdAt: entry.createdAt,
    detail: sortedAuditDetail(entry.detail)
  })).digest("hex");
}

function auditChainRows(entries: SenaEnterpriseAuditLogEntry[]) {
  let chainHash = createHash("sha256").update("sena-enterprise-audit-chain/v1").digest("hex");
  return [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((entry) => {
      const entryHash = auditEntryHash(entry);
      chainHash = createHash("sha256").update(`${chainHash}.${entryHash}`).digest("hex");
      return {
        id: entry.id,
        event: entry.event,
        createdAt: entry.createdAt,
        entryHash,
        chainHash
      };
    });
}

function auditEntriesInScope(db: SenaEnterpriseDb, teamIds: string[], entries = db.auditLog) {
  if (teamIds.length === 0) return [];
  const teamIdSet = new Set(teamIds);
  const scopedUserIds = new Set(db.memberships
    .filter((membership) => teamIdSet.has(membership.teamId))
    .map((membership) => membership.userId));
  return entries.filter((entry) => (
    entry.teamId
      ? teamIdSet.has(entry.teamId)
      : entry.userId
        ? scopedUserIds.has(entry.userId)
        : entry.event === "security.rate_limit"
  ));
}

function auditTeamScope(context?: SenaEnterpriseSessionContext, requestedTeamId?: string) {
  if (!context) {
    const db = readEnterpriseDb();
    return db.teams.map((team) => team.id);
  }
  const manageable = manageableTeamIds(context);
  if (requestedTeamId) {
    requireEnterprisePermission(context, requestedTeamId, "team:manage");
    return [requestedTeamId];
  }
  if (manageable.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for audit log access.", 403, "audit_permission_denied");
  }
  return manageable;
}

export function listEnterpriseAuditLog(context: SenaEnterpriseSessionContext, input: SenaEnterpriseAuditLogQuery = {}): SenaEnterpriseAuditLogResult {
  const db = readEnterpriseDb();
  const teamIds = auditTeamScope(context, input.teamId);
  const from = auditTimestamp(input.from);
  const to = auditTimestamp(input.to);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);

  const filtered = auditEntriesInScope(db, teamIds).filter((entry) => {
    const entryTime = Date.parse(entry.createdAt);
    if (input.event && entry.event !== input.event) return false;
    if (input.projectId && entry.projectId !== input.projectId) return false;
    if (input.userId && entry.userId !== input.userId) return false;
    if (from !== undefined && entryTime < from) return false;
    if (to !== undefined && entryTime > to) return false;
    return true;
  });

  const events = filtered.slice(offset, offset + limit);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditLog,
    generatedAt: now(),
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    filters: {
      userId: input.userId,
      projectId: input.projectId,
      event: input.event,
      from: input.from,
      to: input.to
    },
    pagination: {
      limit,
      offset,
      total: filtered.length,
      returned: events.length,
      nextOffset: offset + events.length < filtered.length ? offset + events.length : null
    },
    events
  };
}

export function verifyEnterpriseAuditIntegrity(context?: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseAuditIntegrity {
  const db = readEnterpriseDb();
  const teamIds = auditTeamScope(context, input.teamId);
  const scopedEntries = auditEntriesInScope(db, teamIds);
  const timestampRows = scopedEntries.map((entry) => Date.parse(entry.createdAt));
  const validTimestamps = timestampRows.every((timestamp) => Number.isFinite(timestamp));
  const newestFirst = scopedEntries.every((entry, index) => {
    if (index === 0) return true;
    return entry.createdAt <= scopedEntries[index - 1].createdAt;
  });
  const oldestTimestamp = validTimestamps && timestampRows.length > 0 ? Math.min(...timestampRows) : undefined;
  const newestTimestamp = validTimestamps && timestampRows.length > 0 ? Math.max(...timestampRows) : undefined;
  const retentionWindowDays = auditRetentionWindowDays();
  const withinConfiguredWindow = retentionWindowDays
    ? oldestTimestamp === undefined || oldestTimestamp >= Date.now() - retentionWindowDays * 24 * 60 * 60 * 1000
    : false;
  const chainRows = auditChainRows(scopedEntries);
  const headHash = chainRows.at(-1)?.chainHash ?? createHash("sha256").update("sena-enterprise-audit-chain/v1.empty").digest("hex");
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "audit-chain-hash",
      label: "Audit chain hash",
      status: validTimestamps ? "pass" : "review",
      evidence: [
        "algorithm=sha256-linked-audit-entry-hash",
        `events=${scopedEntries.length}`,
        `headHash=${headHash}`,
        `validTimestamps=${validTimestamps}`
      ],
      nextAction: validTimestamps ? "Archive the chain head with external audit exports." : "Repair invalid audit timestamps before relying on audit chain evidence."
    },
    {
      id: "audit-event-order",
      label: "Audit event order",
      status: newestFirst ? "pass" : "review",
      evidence: [
        "expected=newest-first",
        `newestFirst=${newestFirst}`
      ],
      nextAction: newestFirst ? "Keep append-only newest-first audit storage." : "Repair audit event ordering before export or restore."
    },
    {
      id: "audit-retention-cap",
      label: "Audit retention cap",
      status: db.auditLog.length <= auditRetentionMaxEvents ? "pass" : "review",
      evidence: [
        `globalEvents=${db.auditLog.length}`,
        `scopedEvents=${scopedEntries.length}`,
        `maxEvents=${auditRetentionMaxEvents}`
      ],
      nextAction: db.auditLog.length <= auditRetentionMaxEvents ? "Export audit chain heads before event rotation." : "Export and rotate audit logs to restore the configured event cap."
    },
    {
      id: "audit-retention-window",
      label: "Audit retention window policy",
      status: retentionWindowDays && withinConfiguredWindow ? "pass" : "review",
      evidence: [
        `retentionDays=${retentionWindowDays ?? "missing"}`,
        `withinWindow=${withinConfiguredWindow}`,
        `oldestEventAt=${oldestTimestamp ? new Date(oldestTimestamp).toISOString() : "none"}`,
        `newestEventAt=${newestTimestamp ? new Date(newestTimestamp).toISOString() : "none"}`
      ],
      nextAction: retentionWindowDays
        ? "Keep SENA_AUDIT_RETENTION_DAYS aligned with institutional retention policy."
        : "Set SENA_AUDIT_RETENTION_DAYS before production audit-log retention is claimed."
    }
  ];
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditIntegrity,
    generatedAt: now(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "review",
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    retention: {
      maxEvents: auditRetentionMaxEvents,
      retainedEvents: scopedEntries.length,
      oldestEventAt: oldestTimestamp ? new Date(oldestTimestamp).toISOString() : undefined,
      newestEventAt: newestTimestamp ? new Date(newestTimestamp).toISOString() : undefined,
      retentionWindowDays,
      withinConfiguredWindow
    },
    chain: {
      algorithm: "sha256-linked-audit-entry-hash",
      eventCount: scopedEntries.length,
      headHash,
      firstEventHash: chainRows[0]?.entryHash,
      lastEventHash: chainRows.at(-1)?.entryHash
    },
    checks,
    sample: chainRows.slice(-10).reverse()
  };
}

function sanitizedAuditForwardDetail(detail: SenaEnterpriseAuditLogEntry["detail"]) {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lowered = key.toLowerCase();
    if (typeof value === "string" && lowered.includes("email") && value.includes("@")) {
      sanitized[`${key}Hash`] = authEmailHash(value);
      sanitized[`${key}Domain`] = authEmailDomain(value);
    } else if (typeof value === "string" && /(token|secret|password|invitecode|code)/i.test(key)) {
      sanitized[`${key}Hash`] = createHash("sha256").update(value).digest("hex");
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function auditWebhookPayload(
  entry: SenaEnterpriseAuditLogEntry,
  delivery: SenaEnterpriseAuditWebhookDelivery,
  attempt: number,
  generatedAt: string,
  integrity: SenaEnterpriseAuditIntegrity,
  chainRow?: ReturnType<typeof auditChainRows>[number]
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditWebhook,
    generatedAt,
    audit: {
      id: entry.id,
      event: entry.event,
      userId: entry.userId,
      teamId: entry.teamId,
      projectId: entry.projectId,
      createdAt: entry.createdAt,
      detail: sanitizedAuditForwardDetail(entry.detail),
      entryHash: chainRow?.entryHash ?? auditEntryHash(entry),
      chainHash: chainRow?.chainHash,
      chainHead: integrity.chain.headHash,
      chainAlgorithm: integrity.chain.algorithm
    },
    integrity: {
      status: integrity.status,
      scopedEvents: integrity.chain.eventCount,
      retentionWindowDays: integrity.retention.retentionWindowDays,
      withinConfiguredWindow: integrity.retention.withinConfiguredWindow
    },
    delivery: {
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      attempt,
      maxAttempts: delivery.maxAttempts
    }
  };
}

async function postAuditWebhook(
  entry: SenaEnterpriseAuditLogEntry,
  delivery: SenaEnterpriseAuditWebhookDelivery,
  integrity: SenaEnterpriseAuditIntegrity,
  chainRow?: ReturnType<typeof auditChainRows>[number]
) {
  const webhookUrl = auditWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Audit webhook delivery is not configured.", 503, "audit_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = delivery.attempts + 1;
  const body = JSON.stringify(auditWebhookPayload(entry, delivery, attempt, generatedAt, integrity, chainRow));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "audit.forward",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-audit-id": entry.id,
    "x-sena-audit-chain-head": integrity.chain.headHash
  };
  const secret = auditWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), auditWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseAuditLog(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; auditId?: string } = {}
): Promise<SenaEnterpriseAuditDeliveryResult> {
  const provider = auditWebhookProvider();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const force = Boolean(input.force);
  const teamIds = auditTeamScope(context, input.teamId);
  const integrity = verifyEnterpriseAuditIntegrity(context, { teamId: input.teamId });
  const result: SenaEnterpriseAuditDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    integrity,
    summary: {
      attempted: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
      skipped: 0
    },
    auditEvents: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const scopedEntries = auditEntriesInScope(db, teamIds);
  const chainRowById = new Map(auditChainRows(scopedEntries).map((row) => [row.id, row]));
  const nowMs = Date.now();
  const deliveryQueue: SenaEnterpriseAuditLogEntry[] = [];

  for (const entry of scopedEntries
    .filter((candidate) => !input.auditId || candidate.id === input.auditId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const delivery = ensureAuditWebhookDelivery(entry);
    if (!delivery) {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.attempts >= delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(entry);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const entry of targets) {
    const delivery = entry.webhookDelivery!;
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(delivery.endpointHash)
      : await postAuditWebhook(entry, delivery, integrity, chainRowById.get(entry.id));
    const attemptedAt = now();
    delivery.attempts += 1;
    delivery.lastAttemptAt = attemptedAt;
    delivery.lastStatus = attemptResult.httpStatus;
    delivery.lastErrorCode = attemptResult.errorCode;
    delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      delivery.status = "delivered";
      delivery.deliveredAt = attemptedAt;
      delete delivery.nextAttemptAt;
      delete delivery.failedAt;
      result.summary.delivered += 1;
    } else if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = "failed";
      delivery.failedAt = attemptedAt;
      delete delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      delivery.status = "pending";
      delivery.nextAttemptAt = webhookRetryAt(delivery.attempts);
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.auditEvents.push({
      auditId: entry.id,
      event: entry.event,
      teamId: entry.teamId,
      projectId: entry.projectId,
      webhookStatus: delivery.status,
      attempts: delivery.attempts,
      httpStatus: delivery.lastStatus,
      errorCode: delivery.lastErrorCode
    });
  }

  saveDb(db);
  return result;
}

function backupRecordCounts(payload: SenaEnterpriseBackupPayload): SenaEnterpriseBackupRecordCounts {
  return {
    users: payload.users.length,
    teams: payload.teams.length,
    memberships: payload.memberships.length,
    invitations: payload.invitations.length,
    uploads: payload.uploads.length,
    importRuns: payload.importRuns.length,
    analysisRuns: (payload.analysisRuns ?? []).length,
    projects: payload.projects.length,
    projectRevisions: payload.projectRevisions.length,
    comments: payload.projectComments.length,
    adjudications: payload.adjudications.length,
    reliabilityRuns: payload.reliabilityRuns.length,
    validationRuns: payload.validationRuns.length,
    expertReviews: (payload.expertReviews ?? []).length,
    platformDecisionAcceptances: (payload.platformDecisionAcceptances ?? []).length,
    releaseGateReviews: (payload.releaseGateReviews ?? []).length,
    postCutoverObservations: (payload.postCutoverObservations ?? []).length,
    goLiveAttestations: (payload.goLiveAttestations ?? []).length,
    notifications: payload.notifications.length,
    auditEvents: payload.auditLog.length
  };
}

function backupPayloadSha256(payload: SenaEnterpriseBackupPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sameRecordCounts(a: SenaEnterpriseBackupRecordCounts, b: SenaEnterpriseBackupRecordCounts) {
  return Object.keys(a).every((key) => {
    const countKey = key as keyof SenaEnterpriseBackupRecordCounts;
    return a[countKey] === b[countKey];
  });
}

function buildBackupPayload(db: SenaEnterpriseDb, teamIds: string[]): SenaEnterpriseBackupPayload {
  const teamIdSet = new Set(teamIds);
  const membershipUserIds = new Set(db.memberships
    .filter((membership) => teamIdSet.has(membership.teamId))
    .map((membership) => membership.userId));
  return {
    users: db.users.filter((user) => membershipUserIds.has(user.id)).map(publicUser),
    teams: db.teams.filter((team) => teamIdSet.has(team.id)),
    memberships: db.memberships.filter((membership) => teamIdSet.has(membership.teamId)),
    invitations: db.invitations.filter((invitation) => teamIdSet.has(invitation.teamId)),
    uploads: db.uploads.filter((upload) => teamIdSet.has(upload.teamId)),
    importRuns: db.importRuns.filter((run) => teamIdSet.has(run.teamId)),
    analysisRuns: db.analysisRuns.filter((run) => teamIdSet.has(run.teamId)),
    projects: db.projects.filter((project) => teamIdSet.has(project.teamId)),
    projectRevisions: db.projectRevisions.filter((revision) => teamIdSet.has(revision.teamId)),
    projectComments: db.projectComments.filter((comment) => teamIdSet.has(comment.teamId)),
    adjudications: db.adjudications.filter((record) => teamIdSet.has(record.teamId)),
    reliabilityRuns: db.reliabilityRuns.filter((run) => teamIdSet.has(run.teamId)),
    validationRuns: db.validationRuns.filter((run) => teamIdSet.has(run.teamId)),
    expertReviews: db.expertReviews.filter((review) => teamIdSet.has(review.teamId)),
    platformDecisionAcceptances: (db.platformDecisionAcceptances ?? []).filter((acceptance) => teamIdSet.has(acceptance.teamId)),
    releaseGateReviews: (db.releaseGateReviews ?? []).filter((review) => teamIdSet.has(review.teamId)),
    postCutoverObservations: (db.postCutoverObservations ?? []).filter((observation) => teamIdSet.has(observation.teamId)),
    goLiveAttestations: (db.goLiveAttestations ?? []).filter((attestation) => teamIdSet.has(attestation.teamId)),
    notifications: db.notifications.filter((notification) => !notification.teamId || teamIdSet.has(notification.teamId)),
    auditLog: db.auditLog.filter((entry) => !entry.teamId || teamIdSet.has(entry.teamId))
  };
}

function backupManifest(
  payload: SenaEnterpriseBackupPayload,
  payloadSha256: string
): SenaEnterpriseBackupArtifact["manifest"] {
  return {
    storageEngine: "file-backed-json",
    storagePathHint: path.basename(dbDir),
    payloadSha256,
    recordCounts: backupRecordCounts(payload),
    retentionPolicy: {
      auditEventsMax: auditRetentionMaxEvents,
      sessionsExcluded: true,
      ssoStatesExcluded: true,
      authLockoutsExcluded: true,
      apiRateLimitsExcluded: true,
      mfaSecretsExcluded: true,
      mfaChallengesExcluded: true,
      emailDeliveriesExcluded: true,
      passwordResetTokensExcluded: true,
      presenceExcluded: true,
      collaborationPubSubExcluded: true,
      passwordHashesExcluded: true,
      uploadBlobsExcluded: true
    }
  };
}

function ensureBackupManagePermission(context: SenaEnterpriseSessionContext, teamId?: string) {
  const manageable = manageableTeamIds(context);
  if (teamId) {
    requireEnterprisePermission(context, teamId, "team:manage");
    return [teamId];
  }
  if (manageable.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backups.", 403, "backup_permission_denied");
  }
  return manageable;
}

export function createEnterpriseBackup(context: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseBackupArtifact {
  const teamIds = ensureBackupManagePermission(context, input.teamId);
  const db = readEnterpriseDb();
  appendAudit(db, {
    event: "governance.backup",
    userId: context.user.id,
    teamId: teamIds.length === 1 ? teamIds[0] : undefined,
    detail: {
      teamIds: teamIds.join("|"),
      mode: input.teamId ? "selected-team" : "managed-teams",
      uploadBlobsIncluded: false
    }
  });
  saveDb(db);

  const payload = buildBackupPayload(db, teamIds);
  const payloadSha = backupPayloadSha256(payload);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackup,
    backupId: id("backup"),
    generatedAt: now(),
    generatedBy: {
      userId: context.user.id,
      email: context.user.email,
      name: context.user.name
    },
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamIds,
      uploadBlobsIncluded: false,
      excludedCollections: ["sessions", "ssoStates", "authLockouts", "apiRateLimits", "mfaSecrets", "mfaChallenges", "emailDeliveries", "passwordResetTokens", "projectPresence", "collaborationEvents", "passwordHash", "uploadBlobs"]
    },
    manifest: backupManifest(payload, payloadSha),
    payload
  };
}

function backupHasPasswordHashes(backup: SenaEnterpriseBackupArtifact) {
  return backup.payload.users.some((user) => Object.prototype.hasOwnProperty.call(user, "passwordHash"));
}

export function verifyEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact
): SenaEnterpriseBackupVerification {
  ensureBackupManagePermission(context);
  if (backup.schemaVersion !== "sena-enterprise-backup/v1") {
    throw new SenaEnterpriseError("Unsupported SENA enterprise backup schema.", 400, "unsupported_backup_schema");
  }

  const db = readEnterpriseDb();
  const payloadSha = backupPayloadSha256(backup.payload);
  const actualCounts = backupRecordCounts(backup.payload);
  const conflicts = {
    teams: backup.payload.teams.filter((team) => db.teams.some((current) => current.id === team.id)).map((team) => team.id),
    projects: backup.payload.projects.filter((project) => db.projects.some((current) => current.id === project.id)).map((project) => project.id),
    uploads: backup.payload.uploads.filter((upload) => db.uploads.some((current) => current.id === upload.id)).map((upload) => upload.id)
  };
  const collisionCount = conflicts.teams.length + conflicts.projects.length + conflicts.uploads.length;
  const checksumPass = payloadSha === backup.manifest.payloadSha256;
  const countsPass = sameRecordCounts(actualCounts, backup.manifest.recordCounts);
  const exclusionsPass = (
    backup.scope.uploadBlobsIncluded === false &&
    backup.manifest.retentionPolicy.sessionsExcluded &&
    backup.manifest.retentionPolicy.ssoStatesExcluded &&
    backup.manifest.retentionPolicy.authLockoutsExcluded &&
    backup.manifest.retentionPolicy.apiRateLimitsExcluded &&
    backup.manifest.retentionPolicy.mfaSecretsExcluded &&
    backup.manifest.retentionPolicy.mfaChallengesExcluded &&
    backup.manifest.retentionPolicy.emailDeliveriesExcluded &&
    backup.manifest.retentionPolicy.passwordResetTokensExcluded &&
    backup.manifest.retentionPolicy.presenceExcluded &&
    backup.manifest.retentionPolicy.collaborationPubSubExcluded &&
    backup.manifest.retentionPolicy.passwordHashesExcluded &&
    backup.manifest.retentionPolicy.uploadBlobsExcluded &&
    !backupHasPasswordHashes(backup)
  );
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "backup-checksum",
      label: "Backup payload checksum",
      status: checksumPass ? "pass" : "review",
      evidence: [`declared=${backup.manifest.payloadSha256}`, `actual=${payloadSha}`],
      nextAction: checksumPass ? "Store this checksum alongside the backup handoff record." : "Reject this backup artifact and regenerate it from the source runtime."
    },
    {
      id: "backup-record-counts",
      label: "Backup record count manifest",
      status: countsPass ? "pass" : "review",
      evidence: Object.entries(actualCounts).map(([key, value]) => `${key}=${value}`),
      nextAction: countsPass ? "Use these counts as restore-run acceptance checks." : "Investigate manifest drift before any restore attempt."
    },
    {
      id: "backup-secret-exclusions",
      label: "Backup secret and ephemeral-state exclusions",
      status: exclusionsPass ? "pass" : "review",
      evidence: [
        `uploadBlobsIncluded=${backup.scope.uploadBlobsIncluded}`,
        `excluded=${backup.scope.excludedCollections.join("|")}`,
        `passwordHashesPresent=${backupHasPasswordHashes(backup)}`
      ],
      nextAction: exclusionsPass ? "Keep secrets and transient session state out of handoff archives." : "Remove secrets or transient runtime state before retaining this backup."
    },
    {
      id: "backup-id-collision-preflight",
      label: "Restore ID collision preflight",
      status: collisionCount === 0 ? "pass" : "review",
      evidence: [
        `teamConflicts=${conflicts.teams.length}`,
        `projectConflicts=${conflicts.projects.length}`,
        `uploadConflicts=${conflicts.uploads.length}`
      ],
      nextAction: collisionCount === 0 ? "Restore rehearsal can proceed against an empty or compatible target." : "Choose replace/merge policy before restoring into this existing runtime."
    }
  ];
  const status = checks.every((check) => check.status === "pass") ? "pass" : "review";
  appendAudit(db, {
    event: "governance.backup.verify",
    userId: context.user.id,
    detail: {
      backupId: backup.backupId,
      status,
      payloadSha256: payloadSha,
      collisions: collisionCount
    }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupVerification,
    status,
    generatedAt: now(),
    backupId: backup.backupId,
    backupGeneratedAt: backup.generatedAt,
    payloadSha256: payloadSha,
    recordCounts: actualCounts,
    conflicts,
    checks
  };
}

function ensureBackupDeliveryPermission(context: SenaEnterpriseSessionContext, backup: SenaEnterpriseBackupArtifact) {
  const manageable = new Set(manageableTeamIds(context));
  const unauthorizedTeam = backup.scope.teamIds.find((teamId) => !manageable.has(teamId));
  if (unauthorizedTeam) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backup delivery.", 403, "backup_delivery_permission_denied");
  }
}

function backupWebhookPayload(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupWebhook,
    generatedAt,
    backup,
    verification,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(backupWebhookSecret())
    }
  };
}

async function postBackupWebhook(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const webhookUrl = backupWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Backup webhook delivery is not configured.", 503, "backup_webhook_not_configured");
  }
  const endpointHash = backupWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(backupWebhookPayload(backup, verification, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "backup.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-backup-id": backup.backupId,
    "x-sena-backup-payload-sha256": verification.payloadSha256
  };
  const secret = backupWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backupWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; backup?: SenaEnterpriseBackupArtifact } = {}
): Promise<SenaEnterpriseBackupDeliveryResult> {
  const provider = backupWebhookProvider();
  const backup = input.backup ?? createEnterpriseBackup(context, { teamId: input.teamId });
  if (input.backup) {
    ensureBackupDeliveryPermission(context, backup);
  }
  const verification = verifyEnterpriseBackup(context, backup);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Backup delivery requires checksum, record counts, and secret exclusions to pass.", 400, "backup_delivery_preflight_failed");
  }

  const result: SenaEnterpriseBackupDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupDelivery,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    backup: {
      backupId: backup.backupId,
      generatedAt: backup.generatedAt,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    verification,
    delivery: {
      attempted: false
    }
  };

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postBackupWebhook(backup, verification);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.delivery = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "governance.backup.deliver" : "governance.backup.deliver.fail",
    userId: context.user.id,
    teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
    detail: {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null,
      teams: verification.recordCounts.teams,
      projects: verification.recordCounts.projects,
      uploads: verification.recordCounts.uploads,
      auditEvents: verification.recordCounts.auditEvents
    }
  });
  saveDb(db);
  return result;
}

function databaseSyncWebhookPayload(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDatabaseSyncWebhook,
    generatedAt,
    sync: {
      kind: "sanitized-enterprise-state",
      sourceStorageEngine: "file-backed-json",
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    backup,
    verification,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(databaseSyncWebhookSecret())
    }
  };
}

async function postDatabaseSyncWebhook(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const webhookUrl = databaseSyncWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Database sync webhook delivery is not configured.", 503, "database_sync_webhook_not_configured");
  }
  const endpointHash = databaseSyncWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(databaseSyncWebhookPayload(backup, verification, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "database.sync",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-database-sync-backup-id": backup.backupId,
    "x-sena-database-sync-payload-sha256": verification.payloadSha256
  };
  const secret = databaseSyncWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), databaseSyncWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeDatabaseSyncPostgres(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const { adapter, pool } = createEnterprisePostgresDatabaseSyncAdapterFromEnv({});
  try {
    const write = await adapter.writeSync(backup, verification);
    return {
      ok: true,
      revision: write.revision,
      errorCode: undefined,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      revision: undefined,
      errorCode: error instanceof Error && "code" in error ? String(error.code) : "postgres_sync_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    await pool.end?.();
  }
}

export async function deliverEnterpriseDatabaseSync(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; backup?: SenaEnterpriseBackupArtifact } = {}
): Promise<SenaEnterpriseDatabaseSyncResult> {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const webhookProvider = databaseSyncWebhookProvider();
  const provider: SenaEnterpriseDatabaseSyncResult["provider"] = postgresConfig.configured
    ? {
      mode: "postgres-native",
      configured: true,
      urlEnvName: postgresConfig.urlEnvName,
      connectionHash: postgresConfig.connectionHash,
      adapter: postgresConfig.adapter,
      secretConfigured: Boolean(postgresConfig.connectionHash),
      timeoutMs: 0
    }
    : webhookProvider;
  const backup = input.backup ?? createEnterpriseBackup(context, { teamId: input.teamId });
  if (input.backup) {
    ensureBackupDeliveryPermission(context, backup);
  }
  const verification = verifyEnterpriseBackup(context, backup);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Database sync requires checksum, record counts, and secret exclusions to pass.", 400, "database_sync_preflight_failed");
  }

  const result: SenaEnterpriseDatabaseSyncResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDatabaseSync,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    backup: {
      backupId: backup.backupId,
      generatedAt: backup.generatedAt,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    verification,
    sync: {
      attempted: false
    }
  };

  if (postgresConfig.configured) {
    const attemptResult = await writeDatabaseSyncPostgres(backup, verification);
    const attemptedAt = now();
    result.status = attemptResult.ok ? "delivered" : "failed";
    result.sync = {
      attempted: true,
      nativeStatus: attemptResult.ok ? "delivered" : "failed",
      attemptedAt,
      revision: attemptResult.revision,
      adapter: postgresConfig.adapter,
      errorCode: attemptResult.errorCode,
      errorHash: attemptResult.errorHash
    };

    const db = readEnterpriseDb();
    appendAudit(db, {
      event: attemptResult.ok ? "governance.database_sync.deliver" : "governance.database_sync.fail",
      userId: context.user.id,
      teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
      detail: {
        backupId: backup.backupId,
        payloadSha256: verification.payloadSha256,
        provider: "postgres-native",
        adapter: postgresConfig.adapter ?? null,
        urlEnvName: postgresConfig.urlEnvName ?? null,
        connectionHash: postgresConfig.connectionHash ?? null,
        revision: attemptResult.revision ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null,
        teams: verification.recordCounts.teams,
        projects: verification.recordCounts.projects,
        uploads: verification.recordCounts.uploads,
        auditEvents: verification.recordCounts.auditEvents
      }
    });
    saveDb(db);
    return result;
  }

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postDatabaseSyncWebhook(backup, verification);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.sync = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "governance.database_sync.deliver" : "governance.database_sync.fail",
    userId: context.user.id,
    teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
    detail: {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null,
      teams: verification.recordCounts.teams,
      projects: verification.recordCounts.projects,
      uploads: verification.recordCounts.uploads,
      auditEvents: verification.recordCounts.auditEvents
    }
  });
  saveDb(db);
  return result;
}

function canManageAnyTeam(context: SenaEnterpriseSessionContext) {
  return context.memberships.some((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"));
}

function ensureBackupRestorePermission(context: SenaEnterpriseSessionContext, backup: SenaEnterpriseBackupArtifact) {
  if (!canManageAnyTeam(context)) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backup restore.", 403, "backup_restore_permission_denied");
  }
  const db = readEnterpriseDb();
  for (const teamId of backup.scope.teamIds) {
    if (db.teams.some((team) => team.id === teamId)) {
      requireEnterprisePermission(context, teamId, "team:manage");
    }
  }
}

function emptyBackupRestoreSummary(): SenaEnterpriseBackupRestoreResult["summary"] {
  return {
    usersCreated: 0,
    usersUpdated: 0,
    teamsCreated: 0,
    teamsUpdated: 0,
    membershipsCreated: 0,
    membershipsUpdated: 0,
    invitationsCreated: 0,
    invitationsUpdated: 0,
    uploadsCreated: 0,
    uploadsUpdated: 0,
    importRunsCreated: 0,
    importRunsUpdated: 0,
    analysisRunsCreated: 0,
    analysisRunsUpdated: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    projectRevisionsCreated: 0,
    projectRevisionsUpdated: 0,
    commentsCreated: 0,
    commentsUpdated: 0,
    adjudicationsCreated: 0,
    adjudicationsUpdated: 0,
    reliabilityRunsCreated: 0,
    reliabilityRunsUpdated: 0,
    validationRunsCreated: 0,
    validationRunsUpdated: 0,
    expertReviewsCreated: 0,
    expertReviewsUpdated: 0,
    platformDecisionAcceptancesCreated: 0,
    platformDecisionAcceptancesUpdated: 0,
    releaseGateReviewsCreated: 0,
    releaseGateReviewsUpdated: 0,
    postCutoverObservationsCreated: 0,
    postCutoverObservationsUpdated: 0,
    goLiveAttestationsCreated: 0,
    goLiveAttestationsUpdated: 0,
    notificationsCreated: 0,
    notificationsUpdated: 0,
    auditEventsCreated: 0,
    auditEventsUpdated: 0
  };
}

function mergeById<T extends { id: string }>(
  target: T[],
  incoming: T[],
  createdKey: keyof SenaEnterpriseBackupRestoreResult["summary"],
  updatedKey: keyof SenaEnterpriseBackupRestoreResult["summary"],
  summary: SenaEnterpriseBackupRestoreResult["summary"],
  mergeRecord: (existing: T | undefined, incoming: T) => T = (_existing, record) => record
) {
  for (const record of incoming) {
    const index = target.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) {
      target[index] = mergeRecord(target[index], record);
      summary[updatedKey] += 1;
    } else {
      target.push(mergeRecord(undefined, record));
      summary[createdKey] += 1;
    }
  }
}

function backupCoreChecksPass(verification: SenaEnterpriseBackupVerification) {
  return ["backup-checksum", "backup-record-counts", "backup-secret-exclusions"].every((id) => (
    verification.checks.find((check) => check.id === id)?.status === "pass"
  ));
}

export function restoreEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  input: { dryRun?: boolean; mode?: "merge" } = {}
): SenaEnterpriseBackupRestoreResult {
  const dryRun = Boolean(input.dryRun);
  const mode = input.mode ?? "merge";
  if (mode !== "merge") {
    throw new SenaEnterpriseError("Only merge restore mode is supported.", 400, "unsupported_backup_restore_mode");
  }
  ensureBackupRestorePermission(context, backup);
  const verification = verifyEnterpriseBackup(context, backup);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Backup restore requires checksum, record counts, and secret exclusions to pass.", 400, "backup_restore_preflight_failed");
  }

  const db = dryRun ? dbWorkingCopy(readEnterpriseDb()) : readEnterpriseDb();
  const summary = emptyBackupRestoreSummary();
  mergeById(db.users, backup.payload.users as SenaEnterpriseUser[], "usersCreated", "usersUpdated", summary, (existing, incoming) => ({
    ...incoming,
    passwordHash: existing?.passwordHash,
    ssoIdentities: incoming.ssoIdentities ?? existing?.ssoIdentities ?? []
  }));
  mergeById(db.teams, backup.payload.teams, "teamsCreated", "teamsUpdated", summary);
  mergeById(db.memberships, backup.payload.memberships, "membershipsCreated", "membershipsUpdated", summary);
  mergeById(db.invitations, backup.payload.invitations, "invitationsCreated", "invitationsUpdated", summary);
  mergeById(db.uploads, backup.payload.uploads, "uploadsCreated", "uploadsUpdated", summary);
  mergeById(db.importRuns, backup.payload.importRuns, "importRunsCreated", "importRunsUpdated", summary);
  mergeById(db.analysisRuns, backup.payload.analysisRuns ?? [], "analysisRunsCreated", "analysisRunsUpdated", summary);
  mergeById(db.projects, backup.payload.projects, "projectsCreated", "projectsUpdated", summary);
  mergeById(db.projectRevisions, backup.payload.projectRevisions, "projectRevisionsCreated", "projectRevisionsUpdated", summary);
  mergeById(db.projectComments, backup.payload.projectComments, "commentsCreated", "commentsUpdated", summary);
  mergeById(db.adjudications, backup.payload.adjudications, "adjudicationsCreated", "adjudicationsUpdated", summary);
  mergeById(db.reliabilityRuns, backup.payload.reliabilityRuns, "reliabilityRunsCreated", "reliabilityRunsUpdated", summary);
  mergeById(db.validationRuns, backup.payload.validationRuns, "validationRunsCreated", "validationRunsUpdated", summary);
  mergeById(db.expertReviews, backup.payload.expertReviews ?? [], "expertReviewsCreated", "expertReviewsUpdated", summary);
  mergeById(db.platformDecisionAcceptances, backup.payload.platformDecisionAcceptances ?? [], "platformDecisionAcceptancesCreated", "platformDecisionAcceptancesUpdated", summary);
  mergeById(db.releaseGateReviews, backup.payload.releaseGateReviews ?? [], "releaseGateReviewsCreated", "releaseGateReviewsUpdated", summary);
  mergeById(db.postCutoverObservations, backup.payload.postCutoverObservations ?? [], "postCutoverObservationsCreated", "postCutoverObservationsUpdated", summary);
  mergeById(db.goLiveAttestations, backup.payload.goLiveAttestations ?? [], "goLiveAttestationsCreated", "goLiveAttestationsUpdated", summary);
  mergeById(db.notifications, backup.payload.notifications, "notificationsCreated", "notificationsUpdated", summary);
  mergeById(db.auditLog, backup.payload.auditLog, "auditEventsCreated", "auditEventsUpdated", summary);

  if (!dryRun) {
    appendAudit(db, {
      event: "governance.backup.restore",
      userId: context.user.id,
      teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
      detail: {
        backupId: backup.backupId,
        mode,
        payloadSha256: verification.payloadSha256,
        teamsCreated: summary.teamsCreated,
        teamsUpdated: summary.teamsUpdated,
        projectsCreated: summary.projectsCreated,
        projectsUpdated: summary.projectsUpdated
      }
    });
    saveDb(db);
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupRestore,
    status: dryRun ? "dry-run" : "completed",
    mode,
    generatedAt: now(),
    backupId: backup.backupId,
    dryRun,
    payloadSha256: verification.payloadSha256,
    verification,
    summary
  };
}

export function createEnterpriseInvitation(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  email: string;
  role: SenaEnterpriseRole;
  baseUrl?: string;
}) {
  requireEnterprisePermission(context, input.teamId, "member:invite");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const invitation: SenaEnterpriseInvitation = {
    id: id("invite"),
    teamId: input.teamId,
    email: normalizeEmail(input.email),
    role: input.role,
    inviteCode: randomBytes(9).toString("base64url"),
    status: "pending",
    invitedBy: context.user.id,
    createdAt: now()
  };
  db.invitations.push(invitation);
  const inviteUrl = invitationRegisterUrl(invitation.inviteCode, input.baseUrl);
  const emailDelivery = queueEnterpriseEmail(db, {
    kind: "team.invite",
    recipientEmail: invitation.email,
    teamId: input.teamId,
    userId: context.user.id,
    subject: `Invitation to ${team.name} on SENA`,
    bodyText: `${context.user.name} invited you to ${team.name} as ${invitation.role}. Use the secure invitation link to create or join your SENA account.`,
    actionUrl: inviteUrl,
    templateData: {
      invitationId: invitation.id,
      inviteCode: invitation.inviteCode,
      teamName: team.name,
      role: invitation.role,
      invitedBy: context.user.id,
      invitedByName: context.user.name
    }
  });
  appendAudit(db, {
    event: "team.invite",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      email: invitation.email,
      role: invitation.role,
      emailDeliveryId: emailDelivery?.id ?? null
    }
  });
  queueEnterpriseNotification(db, {
    kind: "team.invite",
    email: invitation.email,
    teamId: input.teamId,
    title: "SENA team invitation",
    body: `${context.user.name} invited you to ${team.name} as ${invitation.role}.`,
    actionUrl: inviteUrl,
    detail: {
      invitationId: invitation.id,
      role: invitation.role,
      invitedBy: context.user.id,
      emailDeliveryId: emailDelivery?.id ?? null
    }
  });
  saveDb(db);
  return invitation;
}

export function acceptEnterpriseInvitation(context: SenaEnterpriseSessionContext, input: {
  invitationId?: string;
  inviteCode?: string;
}) {
  const invitationId = input.invitationId?.trim();
  const inviteCode = input.inviteCode?.trim();
  if (!invitationId && !inviteCode) {
    throw new SenaEnterpriseError("Invitation ID or invite code is required.", 400, "invitation_reference_required");
  }

  const db = readEnterpriseDb();
  const invitation = db.invitations.find((candidate) => (
    invitationId ? candidate.id === invitationId : candidate.inviteCode === inviteCode
  ));
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  if (invitation.status !== "pending") {
    throw new SenaEnterpriseError("Invitation is no longer pending.", 409, "invitation_not_pending");
  }
  if (normalizeEmail(context.user.email) !== invitation.email) {
    throw new SenaEnterpriseError("Invitation email does not match the signed-in user.", 403, "invitation_email_mismatch");
  }
  const team = db.teams.find((candidate) => candidate.id === invitation.teamId);
  if (!team) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
  if (db.memberships.some((membership) => membership.teamId === invitation.teamId && membership.userId === context.user.id)) {
    throw new SenaEnterpriseError("The signed-in user is already a member of this team.", 409, "membership_already_exists");
  }

  const timestamp = now();
  const membership: SenaEnterpriseMembership = {
    id: id("member"),
    teamId: invitation.teamId,
    userId: context.user.id,
    role: invitation.role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.memberships.push(membership);
  invitation.status = "accepted";
  invitation.acceptedAt = timestamp;
  appendAudit(db, {
    event: "team.invite.accept",
    userId: context.user.id,
    teamId: invitation.teamId,
    detail: {
      invitationId: invitation.id,
      role: invitation.role,
      method: invitationId ? "invitation-id" : "invite-code"
    }
  });
  saveDb(db);
  const session = db.sessions.find((candidate) => candidate.id === context.session.id) ?? context.session;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.teamInvitationAcceptance,
    invitation,
    membership,
    context: contextFromDb(db, session)
  };
}

function activeTeamManagerCount(db: SenaEnterpriseDb, teamId: string, override?: {
  membershipId: string;
  role: SenaEnterpriseRole;
  status: SenaEnterpriseMembership["status"];
}) {
  return db.memberships.filter((membership) => {
    const role = override?.membershipId === membership.id ? override.role : membership.role;
    const status = override?.membershipId === membership.id ? override.status : membership.status;
    return membership.teamId === teamId && status === "active" && rolePermissions[role].includes("team:manage");
  }).length;
}

export function updateEnterpriseMembership(context: SenaEnterpriseSessionContext, membershipId: string, input: {
  role?: SenaEnterpriseRole;
  status?: SenaEnterpriseMembership["status"];
}) {
  const db = readEnterpriseDb();
  const membership = db.memberships.find((candidate) => candidate.id === membershipId);
  if (!membership) throw new SenaEnterpriseError("Membership was not found.", 404, "membership_not_found");
  requireEnterprisePermission(context, membership.teamId, "team:manage");

  const nextRole = input.role ?? membership.role;
  const nextStatus = input.status ?? membership.status;
  if (!rolePermissions[nextRole]) {
    throw new SenaEnterpriseError("Unsupported SENA team role.", 400, "unsupported_team_role");
  }
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    throw new SenaEnterpriseError("Unsupported SENA membership status.", 400, "unsupported_membership_status");
  }
  if (activeTeamManagerCount(db, membership.teamId, { membershipId, role: nextRole, status: nextStatus }) === 0) {
    throw new SenaEnterpriseError("At least one active PI or owner must keep team management permission.", 400, "last_team_manager_required");
  }

  const previousRole = membership.role;
  const previousStatus = membership.status;
  membership.role = nextRole;
  membership.status = nextStatus;
  membership.updatedAt = now();

  appendAudit(db, {
    event: "team.membership.update",
    userId: context.user.id,
    teamId: membership.teamId,
    detail: {
      membershipId,
      targetUserId: membership.userId,
      previousRole,
      role: membership.role,
      previousStatus,
      status: membership.status
    }
  });
  saveDb(db);
  return membership;
}

export function revokeEnterpriseInvitation(context: SenaEnterpriseSessionContext, invitationId: string) {
  const db = readEnterpriseDb();
  const invitation = db.invitations.find((candidate) => candidate.id === invitationId);
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  requireEnterprisePermission(context, invitation.teamId, "member:invite");
  if (invitation.status === "accepted") {
    throw new SenaEnterpriseError("Accepted invitations cannot be revoked.", 409, "invitation_already_accepted");
  }
  invitation.status = "revoked";
  appendAudit(db, {
    event: "team.invite.revoke",
    userId: context.user.id,
    teamId: invitation.teamId,
    detail: {
      invitationId,
      email: invitation.email,
      role: invitation.role
    }
  });
  saveDb(db);
  return invitation;
}

function requireProjectPermissionFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  projectId: string,
  permission: SenaEnterprisePermission
) {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, permission);
  return project;
}

function queueEnterpriseCollaborationEvent(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseCollaborationPubSubEventKind;
  teamId: string;
  projectId: string;
  actorUserId: string;
  detail: Record<string, string | number | boolean | null>;
}) {
  const provider = collaborationPubSubProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  const timestamp = now();
  const event: SenaEnterpriseCollaborationPubSubEvent = {
    id: id("collab_evt"),
    kind: input.kind,
    teamId: input.teamId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    createdAt: timestamp,
    detail: input.detail,
    delivery: {
      provider: "webhook",
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: timestamp,
      attempts: 0,
      maxAttempts: provider.maxAttempts
    }
  };
  db.collaborationEvents.unshift(event);
  db.collaborationEvents = db.collaborationEvents.slice(0, 2000);
  return event;
}

function collaborationPubSubEventPayload(
  event: SenaEnterpriseCollaborationPubSubEvent,
  attempt: number,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubWebhook,
    generatedAt,
    event: {
      id: event.id,
      kind: event.kind,
      teamId: event.teamId,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt,
      detail: event.detail
    },
    delivery: {
      provider: event.delivery.provider,
      endpointHash: event.delivery.endpointHash,
      attempt,
      maxAttempts: event.delivery.maxAttempts
    }
  };
}

async function postCollaborationPubSubWebhook(event: SenaEnterpriseCollaborationPubSubEvent) {
  const webhookUrl = collaborationPubSubWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Collaboration pub/sub webhook delivery is not configured.", 503, "collaboration_pubsub_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = event.delivery.attempts + 1;
  const body = JSON.stringify(collaborationPubSubEventPayload(event, attempt, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "collaboration.publish",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-collaboration-event-id": event.id,
    "x-sena-project-id": event.projectId
  };
  const secret = collaborationPubSubWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), collaborationPubSubTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function collaborationPubSubTeamScope(context: SenaEnterpriseSessionContext, input: { teamId?: string; projectId?: string }) {
  const db = readEnterpriseDb();
  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "team:manage");
    return [project.teamId];
  }
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
    return [input.teamId];
  }
  const teamIds = manageableTeamIds(context);
  if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for collaboration pub/sub delivery.", 403, "collaboration_pubsub_permission_denied");
  }
  return teamIds;
}

export async function deliverEnterpriseCollaborationPubSub(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string; limit?: number; force?: boolean; eventId?: string } = {}
): Promise<SenaEnterpriseCollaborationPubSubDeliveryResult> {
  const provider = collaborationPubSubProvider();
  const teamIds = collaborationPubSubTeamScope(context, input);
  const teamIdSet = new Set(teamIds);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const force = Boolean(input.force);
  const result: SenaEnterpriseCollaborationPubSubDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      requestedProjectId: input.projectId,
      limit,
      force
    },
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      skipped: 0
    },
    events: []
  };

  if (!provider.configured) return result;

  const db = readEnterpriseDb();
  const nowMs = Date.now();
  const queue = (db.collaborationEvents ?? [])
    .filter((event) => teamIdSet.has(event.teamId))
    .filter((event) => !input.projectId || event.projectId === input.projectId)
    .filter((event) => !input.eventId || event.id === input.eventId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const deliveryQueue: SenaEnterpriseCollaborationPubSubEvent[] = [];

  for (const event of queue) {
    if (event.delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (event.delivery.attempts >= event.delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && event.delivery.nextAttemptAt && Date.parse(event.delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(event);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const event of targets) {
    if (provider.endpointHash && event.delivery.endpointHash !== provider.endpointHash) {
      event.delivery.endpointHash = provider.endpointHash;
      event.delivery.status = "pending";
      event.delivery.attempts = 0;
      event.delivery.maxAttempts = provider.maxAttempts;
      delete event.delivery.nextAttemptAt;
      delete event.delivery.deliveredAt;
      delete event.delivery.failedAt;
    }
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(event.delivery.endpointHash)
      : await postCollaborationPubSubWebhook(event);
    const attemptedAt = now();
    event.delivery.attempts += 1;
    event.delivery.lastAttemptAt = attemptedAt;
    event.delivery.lastStatus = attemptResult.httpStatus;
    event.delivery.lastErrorCode = attemptResult.errorCode;
    event.delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      event.delivery.status = "delivered";
      event.delivery.deliveredAt = attemptedAt;
      delete event.delivery.nextAttemptAt;
      delete event.delivery.failedAt;
      result.summary.delivered += 1;
    } else if (event.delivery.attempts >= event.delivery.maxAttempts) {
      event.delivery.status = "failed";
      event.delivery.failedAt = attemptedAt;
      delete event.delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      event.delivery.status = "pending";
      event.delivery.nextAttemptAt = webhookRetryAt(event.delivery.attempts);
      result.summary.pending += 1;
    }
    result.summary.attempted += 1;
    result.events.push({
      eventId: event.id,
      kind: event.kind,
      teamId: event.teamId,
      projectId: event.projectId,
      deliveryStatus: event.delivery.status,
      attempts: event.delivery.attempts,
      httpStatus: event.delivery.lastStatus,
      errorCode: event.delivery.lastErrorCode
    });
    appendAudit(db, {
      event: attemptResult.ok ? "collaboration.pubsub.deliver" : "collaboration.pubsub.fail",
      userId: context.user.id,
      teamId: event.teamId,
      projectId: event.projectId,
      detail: {
        eventId: event.id,
        kind: event.kind,
        endpointHash: event.delivery.endpointHash,
        httpStatus: attemptResult.httpStatus ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null
      }
    });
  }

  saveDb(db);
  return result;
}

export function listEnterpriseProjectCollaboration(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const userById = new Map(db.users.map((user) => [user.id, publicUser(user)]));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectCollaboration,
    project: {
      id: project.id,
      title: project.title,
      teamId: project.teamId,
      currentVersion: project.currentVersion,
      updatedAt: project.updatedAt
    },
    revisions: db.projectRevisions
      .filter((revision) => revision.projectId === projectId)
      .sort((a, b) => b.version - a.version)
      .map(({ snapshot: _snapshot, ...revision }) => ({
        ...revision,
        user: userById.get(revision.userId) ?? null
      })),
    comments: db.projectComments
      .filter((comment) => comment.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((comment) => ({
        ...comment,
        user: userById.get(comment.userId) ?? null
      })),
    presence: visiblePresence(db, projectId).map((presence) => ({
      ...presence,
      user: userById.get(presence.userId) ?? null
    })),
    adjudications: db.adjudications
      .filter((record) => record.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        ...record,
        reviewer: userById.get(record.reviewerId) ?? null
      })),
    reliabilityRuns: db.reliabilityRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    validationRuns: db.validationRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    expertReviews: db.expertReviews
      .filter((review) => review.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function touchEnterpriseProjectPresence(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const existing = db.projectPresence.find((presence) => presence.projectId === projectId && presence.userId === context.user.id);
  if (existing) {
    existing.activeView = input.activeView?.trim() || existing.activeView;
    existing.cursorLabel = input.cursorLabel?.trim() || existing.cursorLabel;
    existing.updatedAt = timestamp;
    existing.expiresAt = expiresAt;
  } else {
    db.projectPresence.push({
      id: id("presence"),
      projectId,
      teamId: project.teamId,
      userId: context.user.id,
      activeView: input.activeView?.trim() || "workspace",
      cursorLabel: input.cursorLabel?.trim() || "SENA workspace",
      updatedAt: timestamp,
      expiresAt
    });
  }
  appendAudit(db, { event: "project.presence", userId: context.user.id, teamId: project.teamId, projectId, detail: { activeView: input.activeView || "workspace" } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "presence",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      activeView: input.activeView?.trim() || "workspace",
      cursorLabel: input.cursorLabel?.trim() || "SENA workspace"
    }
  });
  saveDb(db);
  return listEnterpriseProjectCollaboration(context, projectId).presence;
}

export function createEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:comment");
  const timestamp = now();
  const comment: SenaEnterpriseProjectComment = {
    id: id("comment"),
    projectId,
    teamId: project.teamId,
    userId: context.user.id,
    body: input.body.trim(),
    target: input.target ?? { kind: "project" },
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (!comment.body) throw new SenaEnterpriseError("Comment body is required.", 400, "comment_body_required");
  db.projectComments.push(comment);
  appendAudit(db, { event: "project.comment", userId: context.user.id, teamId: project.teamId, projectId, detail: { target: comment.target.kind, targetId: comment.target.id ?? null } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "comment",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      commentId: comment.id,
      target: comment.target.kind,
      targetId: comment.target.id ?? null,
      status: comment.status
    }
  });
  notifyProjectReaders(db, project, {
    kind: "project.comment",
    title: "New SENA project comment",
    body: `${context.user.name} commented on ${project.title}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(project.id)}`,
    excludeUserId: context.user.id,
    detail: {
      commentId: comment.id,
      target: comment.target.kind,
      targetId: comment.target.id ?? null
    }
  });
  saveDb(db);
  return comment;
}

export function resolveEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, commentId: string) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:comment");
  const comment = db.projectComments.find((candidate) => candidate.id === commentId && candidate.projectId === projectId);
  if (!comment) throw new SenaEnterpriseError("Comment was not found.", 404, "comment_not_found");
  comment.status = "resolved";
  comment.updatedAt = now();
  appendAudit(db, { event: "project.comment.resolve", userId: context.user.id, teamId: project.teamId, projectId, detail: { commentId } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "comment.resolve",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      commentId,
      status: comment.status
    }
  });
  saveDb(db);
  return comment;
}

export function createEnterpriseAdjudicationRecord(context: SenaEnterpriseSessionContext, projectId: string, input: {
  reliabilityRunId?: string;
  itemId: string;
  codeId: string;
  decision: SenaEnterpriseAdjudicationRecord["decision"];
  notes?: string;
  coderValues?: Record<string, boolean>;
}) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "reliability:adjudicate");
  const reliabilityRun = input.reliabilityRunId
    ? db.reliabilityRuns.find((run) => run.id === input.reliabilityRunId)
    : undefined;
  if (input.reliabilityRunId && !reliabilityRun) {
    throw new SenaEnterpriseError("Reliability run was not found for adjudication.", 404, "reliability_run_not_found");
  }
  if (reliabilityRun && reliabilityRun.projectId !== projectId) {
    throw new SenaEnterpriseError("Adjudication reliability run does not belong to this project.", 400, "adjudication_reliability_project_mismatch");
  }
  const record: SenaEnterpriseAdjudicationRecord = {
    id: id("adj"),
    projectId,
    teamId: project.teamId,
    reliabilityRunId: reliabilityRun?.id,
    itemId: input.itemId.trim(),
    codeId: input.codeId.trim(),
    decision: input.decision,
    reviewerId: context.user.id,
    notes: input.notes?.trim() ?? "",
    coderValues: input.coderValues ?? {},
    createdAt: now()
  };
  if (!record.itemId || !record.codeId) {
    throw new SenaEnterpriseError("Adjudication item and code are required.", 400, "adjudication_target_required");
  }
  db.adjudications.push(record);
  appendAudit(db, {
    event: "project.adjudicate",
    userId: context.user.id,
    teamId: project.teamId,
    projectId,
    detail: {
      itemId: record.itemId,
      codeId: record.codeId,
      decision: record.decision,
      reliabilityRunId: record.reliabilityRunId ?? null
    }
  });
  queueEnterpriseCollaborationEvent(db, {
    kind: "adjudication",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      adjudicationId: record.id,
      itemId: record.itemId,
      codeId: record.codeId,
      decision: record.decision,
      reliabilityRunId: record.reliabilityRunId ?? null
    }
  });
  if (reliabilityRun) refreshReliabilityAdjudicationCoverage(db, reliabilityRun);
  saveDb(db);
  return record;
}

export function createEnterpriseReliabilityRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  projectId?: string;
  reviewer: string;
  fileCount: number;
  annotationCount: number;
  inputFiles: SenaEnterpriseReliabilityRun["inputFiles"];
  dashboard: SenaReliabilityDashboard;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
}) {
  requireEnterprisePermission(context, input.teamId, "reliability:adjudicate");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Reliability run team does not match the project team.", 400, "reliability_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "reliability:adjudicate");
  }
  const timestamp = now();
  const run: SenaEnterpriseReliabilityRun = {
    id: id("rel"),
    teamId: input.teamId,
    projectId: input.projectId,
    userId: context.user.id,
    status: input.dashboard.disagreementCount > 0 ? "pending-adjudication" : "pending-review",
    reviewer: input.reviewer.trim() || context.user.name,
    fileCount: input.fileCount,
    annotationCount: input.annotationCount,
    coderCount: input.dashboard.coderCount,
    itemCount: input.dashboard.itemCount,
    codeCount: input.dashboard.codeCount,
    meanPairwiseKappa: input.dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: input.dashboard.krippendorffAlphaNominal,
    disagreementCount: input.dashboard.disagreementCount,
    inputFiles: input.inputFiles,
    dashboard: input.dashboard,
    adjudicationCoverage: {
      schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
      queuedDisagreements: 0,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 0, exclude: 0, revise: 0 },
      updatedAt: timestamp
    },
    reviewPatch: input.reviewPatch,
    createdAt: timestamp
  };
  refreshReliabilityAdjudicationCoverage(db, run);
  db.reliabilityRuns.unshift(run);
  db.reliabilityRuns = db.reliabilityRuns.slice(0, 1000);
  appendAudit(db, {
    event: "reliability.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      reliabilityRunId: run.id,
      files: run.fileCount,
      annotations: run.annotationCount,
      coders: run.coderCount,
      items: run.itemCount,
      kappa: run.meanPairwiseKappa,
      alpha: run.krippendorffAlphaNominal,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements
    }
  });
  saveDb(db);
  return run;
}

export function createEnterpriseReliabilityAdjudications(context: SenaEnterpriseSessionContext, runId: string, input: {
  decision?: SenaEnterpriseAdjudicationRecord["decision"];
  notes?: string;
  limit?: number;
} = {}): SenaEnterpriseReliabilityAdjudicationResult {
  const db = readEnterpriseDb();
  const run = db.reliabilityRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Reliability run was not found.", 404, "reliability_run_not_found");
  if (!run.projectId) {
    throw new SenaEnterpriseError("Reliability run must be linked to a project before adjudication records can be created.", 400, "reliability_project_required");
  }
  const project = db.projects.find((candidate) => candidate.id === run.projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  if (project.teamId !== run.teamId) {
    throw new SenaEnterpriseError("Reliability run team does not match the project team.", 400, "reliability_project_team_mismatch");
  }
  requireEnterprisePermission(context, run.teamId, "reliability:adjudicate");

  const decision = input.decision === "include" || input.decision === "exclude" || input.decision === "revise"
    ? input.decision
    : "revise";
  const queue = run.dashboard.adjudicationQueue.slice(0, Math.min(Math.max(Math.trunc(input.limit ?? run.dashboard.adjudicationQueue.length), 1), 200));
  const adjudications: SenaEnterpriseAdjudicationRecord[] = [];
  let skippedExisting = 0;
  const timestamp = now();
  for (const disagreement of queue) {
    const existing = db.adjudications.find((record) => (
      record.projectId === run.projectId &&
      record.reliabilityRunId === run.id &&
      record.itemId === disagreement.itemId &&
      record.codeId === disagreement.codeId
    ));
    if (existing) {
      skippedExisting += 1;
      continue;
    }
    const record: SenaEnterpriseAdjudicationRecord = {
      id: id("adj"),
      projectId: run.projectId,
      teamId: run.teamId,
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision,
      reviewerId: context.user.id,
      notes: input.notes?.trim() || `Generated from reliability run ${run.id} disagreement queue.`,
      coderValues: disagreement.values,
      createdAt: timestamp
    };
    db.adjudications.push(record);
    adjudications.push(record);
  }
  const coverage = refreshReliabilityAdjudicationCoverage(db, run);

  appendAudit(db, {
    event: "reliability.adjudicate",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      reliabilityRunId: run.id,
      decision,
      queued: run.dashboard.adjudicationQueue.length,
      created: adjudications.length,
      skippedExisting,
      resolvedDisagreements: coverage.resolvedDisagreements,
      unresolvedDisagreements: coverage.unresolvedDisagreements,
      coverageRate: coverage.coverageRate
    }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReliabilityAdjudication,
    reliabilityRunId: run.id,
    projectId: run.projectId,
    teamId: run.teamId,
    decision,
    summary: {
      queuedDisagreements: run.dashboard.adjudicationQueue.length,
      created: adjudications.length,
      skippedExisting,
      resolvedDisagreements: coverage.resolvedDisagreements,
      unresolvedDisagreements: coverage.unresolvedDisagreements,
      coverageRate: coverage.coverageRate
    },
    reliabilityRun: run,
    adjudications
  };
}

export function reviewEnterpriseReliabilityRun(context: SenaEnterpriseSessionContext, runId: string, input: {
  status: Extract<SenaEnterpriseReliabilityRunStatus, "pending-adjudication" | "approved" | "rejected">;
  notes?: string;
}) {
  const db = readEnterpriseDb();
  const run = db.reliabilityRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Reliability run was not found.", 404, "reliability_run_not_found");
  requireEnterprisePermission(context, run.teamId, "reliability:adjudicate");
  const coverage = refreshReliabilityAdjudicationCoverage(db, run);

  if (input.status === "approved" && coverage.unresolvedDisagreements > 0) {
    throw new SenaEnterpriseError("Reliability approval requires all queued reliability disagreements to be adjudicated for this run.", 400, "reliability_adjudication_coverage_required");
  }

  run.status = input.status;
  run.reviewedBy = context.user.id;
  run.reviewedAt = now();
  run.reviewNotes = input.notes?.trim() ?? "";
  refreshReliabilityAdjudicationCoverage(db, run);
  appendAudit(db, {
    event: "reliability.review",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      reliabilityRunId: run.id,
      status: run.status,
      disagreements: run.disagreementCount,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements,
      reviewer: context.user.name
    }
  });
  queueEnterpriseNotification(db, {
    kind: "reliability.review",
    userId: run.userId,
    teamId: run.teamId,
    projectId: run.projectId,
    title: "Coding reliability review updated",
    body: `${context.user.name} marked a reliability run as ${run.status}.`,
    actionUrl: run.projectId ? `/workspace/sena?projectId=${encodeURIComponent(run.projectId)}` : "/workspace/sena",
    detail: {
      reliabilityRunId: run.id,
      status: run.status,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements,
      reviewerId: context.user.id
    }
  });
  saveDb(db);
  return run;
}

export function listEnterpriseReliabilityRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("reliability:adjudicate"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "reliability:adjudicate");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "reliability:adjudicate");
    teamIds = new Set([project.teamId]);
  }

  return db.reliabilityRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function primaryValidationComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === "sena-group-comparison-suite/v1" ? result.primary : result;
}

function validationRunSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryValidationComparison(result);
  const suite = result.schemaVersion === "sena-group-comparison-suite/v1" ? result : null;
  return {
    primary,
    comparisonCount: suite?.comparisonCount ?? 1,
    minHolmAdjustedP: suite
      ? suite.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1)
      : undefined,
    significantHolmCount: suite?.significantHolmCount
  };
}

function comparisonPlanRow(result: SenaGroupComparisonResult) {
  return {
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB
  };
}

function buildValidationPreregistrationPlan(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationNote?: string;
  methodNote?: string;
}): SenaEnterpriseValidationPreregistrationPlan {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === "sena-group-comparison-suite/v1" ? input.result : null;
  const protocolNote = input.preregistrationNote?.trim() ?? "";
  const methodNote = input.methodNote?.trim() ?? "";
  const analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"] = suite ? "holm-suite" : "single-comparison";
  const comparisons = suite
    ? suite.comparisons.map(comparisonPlanRow)
    : [comparisonPlanRow(primary)];
  const parameters: SenaEnterpriseValidationPreregistrationPlan["parameters"] = {
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    seed: primary.permutation.seed,
    ...(suite ? { alpha: suite.alpha, correction: suite.correction } : {})
  };
  const evidence = [
    `protocolNote=${protocolNote ? "present" : "missing"}`,
    `methodNote=${methodNote ? "present" : "missing"}`,
    `analysis=${analysis}`,
    `comparisons=${comparisons.length}`,
    ...(suite ? [`correction=${suite.correction}`] : []),
    `permutationIterations=${parameters.permutationIterations}`,
    `bootstrapIterations=${parameters.bootstrapIterations}`,
    `seed=${parameters.seed}`
  ];
  const planBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationPreregistrationPlan,
    hashAlgorithm: "sha256" as const,
    analysis,
    primary: comparisonPlanRow(primary),
    comparisons,
    parameters,
    protocolNoteHash: sha256Text(protocolNote),
    methodNoteHash: sha256Text(methodNote),
    guardrail: input.result.guardrail,
    evidence
  };
  return {
    ...planBody,
    planHash: artifactSha256(planBody)
  };
}

function deriveValidationParityEvidenceFromProject(
  db: SenaEnterpriseDb,
  project: SenaEnterpriseProject | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!project) return undefined;
  const linkedAnalysisRuns = db.analysisRuns.filter((run) => (
    run.projectId === project.id || run.persistedProjectId === project.id
  ));
  const analysisRun = latestByTimestamp(linkedAnalysisRuns);
  if (analysisRun) {
    return {
      walkthroughDatasetLabel: `analysis:${analysisRun.title}`,
      walkthroughDatasetHash: analysisRun.artifactFingerprints.projectSnapshotSha256,
      walkthroughSource: "analysis-run",
      walkthroughSourceId: analysisRun.id,
      notes: [
        `walkthroughSource=analysis-run:${analysisRun.id}`,
        `analysisSourceKind=${analysisRun.sourceKind}`,
        `reportSha256=${analysisRun.artifactFingerprints.reportSha256}`,
        `projectSnapshotSha256=${analysisRun.artifactFingerprints.projectSnapshotSha256}`,
        ...(analysisRun.artifactFingerprints.runtimeBundleSha256 ? [`runtimeBundleSha256=${analysisRun.artifactFingerprints.runtimeBundleSha256}`] : [])
      ]
    };
  }
  return {
    walkthroughDatasetLabel: `project:${project.title}`,
    walkthroughDatasetHash: artifactSha256(project.snapshot),
    walkthroughSource: "project-snapshot",
    walkthroughSourceId: project.id,
    notes: [
      `walkthroughSource=project-snapshot:${project.id}`,
      `projectSnapshotSha256=${artifactSha256(project.snapshot)}`
    ]
  };
}

function mergeValidationParityEvidenceInput(
  automaticEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined,
  manualEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!automaticEvidence && !manualEvidence) return undefined;
  return {
    walkthroughDatasetLabel: manualEvidence?.walkthroughDatasetLabel ?? automaticEvidence?.walkthroughDatasetLabel,
    walkthroughDatasetHash: manualEvidence?.walkthroughDatasetHash ?? automaticEvidence?.walkthroughDatasetHash,
    walkthroughSource: manualEvidence?.walkthroughSource ?? automaticEvidence?.walkthroughSource,
    walkthroughSourceId: manualEvidence?.walkthroughSourceId ?? automaticEvidence?.walkthroughSourceId,
    expertReviewRequired: manualEvidence?.expertReviewRequired ?? automaticEvidence?.expertReviewRequired,
    studySpecificInferenceReference: manualEvidence?.studySpecificInferenceReference ?? automaticEvidence?.studySpecificInferenceReference,
    runtimeParityIds: manualEvidence?.runtimeParityIds ?? automaticEvidence?.runtimeParityIds,
    notes: [
      ...(automaticEvidence?.notes ?? []),
      ...(manualEvidence?.notes ?? [])
    ]
  };
}

function buildFormalInferenceReadiness(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  inference: SenaEnterpriseValidationParityEvidence["inference"];
  gates: SenaEnterpriseValidationParityEvidence["gates"];
}): SenaEnterpriseFormalInferenceReadiness {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === "sena-group-comparison-suite/v1" ? input.result : null;
  const minGroupSize = suite?.diagnostics.minGroupSize ?? primary.diagnostics.minGroupSize;
  const smallSampleComparisons = suite?.diagnostics.smallSampleComparisons ?? (primary.diagnostics.smallSample ? 1 : 0);
  const runtimeParityPassed = input.gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
    .every((gate) => gate.status === "passed");
  const walkthroughPassed = input.gates.some((gate) => gate.id === "real-data-walkthrough" && gate.status === "passed");
  const studySpecificInferenceReference = input.inference.studySpecificInferenceReference?.trim();
  const checks: SenaEnterpriseFormalInferenceReadiness["checks"] = [
    {
      id: "preregistration-plan",
      label: "Preregistration plan hash",
      status: input.preregistrationPlan.planHash ? "passed" : "required",
      evidence: [
        `schema=${input.preregistrationPlan.schemaVersion}`,
        `planHash=${input.preregistrationPlan.planHash || "missing"}`,
        `analysis=${input.preregistrationPlan.analysis}`
      ]
    },
    {
      id: "study-specific-model",
      label: "Study-specific inferential model reference",
      status: studySpecificInferenceReference ? "passed" : "required",
      evidence: [`reference=${studySpecificInferenceReference || "required-before-publication-claim"}`]
    },
    {
      id: "runtime-parity",
      label: "rENA and R sna parity fixtures",
      status: runtimeParityPassed ? "passed" : "required",
      evidence: input.gates
        .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
        .map((gate) => `${gate.id}:${gate.status}`)
    },
    {
      id: "real-data-walkthrough",
      label: "Real-data walkthrough anchor",
      status: walkthroughPassed ? "passed" : "required",
      evidence: input.gates.find((gate) => gate.id === "real-data-walkthrough")?.evidence ?? ["walkthrough=missing"]
    },
    {
      id: "multiplicity-control",
      label: "Multiple-comparison control",
      status: suite ? suite.correction === "holm" ? "passed" : "required" : "passed",
      evidence: suite
        ? [`correction=${suite.correction}`, `comparisons=${suite.comparisonCount}`, `alpha=${suite.alpha}`]
        : ["singleComparison=true"]
    },
    {
      id: "sample-size",
      label: "Group-size diagnostic",
      status: smallSampleComparisons > 0 || minGroupSize < 5 ? "review" : "passed",
      evidence: [`minGroupSize=${minGroupSize}`, `smallSampleComparisons=${smallSampleComparisons}`]
    }
  ];
  const blockers = checks
    .filter((check) => check.status === "required")
    .map((check) => check.id);
  const warnings = [
    ...(smallSampleComparisons > 0 ? [`small-sample-comparisons=${smallSampleComparisons}`] : []),
    ...(minGroupSize < 5 ? [`minGroupSize=${minGroupSize}`] : [])
  ];
  const status: SenaEnterpriseFormalInferenceReadiness["status"] = !runtimeParityPassed || !walkthroughPassed || !input.preregistrationPlan.planHash
    ? "incomplete"
    : studySpecificInferenceReference
      ? "model-referenced"
      : "model-required";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.formalInferenceReadiness,
    status,
    resultSchemaVersion: input.result.schemaVersion,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    studySpecificInferenceReference: studySpecificInferenceReference || undefined,
    comparisonCount: suite?.comparisonCount ?? 1,
    minGroupSize,
    smallSampleComparisons,
    permutationIterations: input.inference.permutationIterations,
    bootstrapIterations: input.inference.bootstrapIterations,
    alpha: input.inference.alpha,
    correction: input.inference.correction,
    checks,
    blockers,
    warnings,
    guardrail: "Formal inference readiness records whether SENA validation has preregistration, runtime parity, real-data walkthrough, multiplicity control, and a study-specific model reference; it does not replace the model or domain review."
  };
}

function buildValidationParityEvidence(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
}): SenaEnterpriseValidationParityEvidence {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === "sena-group-comparison-suite/v1" ? input.result : null;
  const requestedRuntimeIds = new Set(input.parityEvidence?.runtimeParityIds?.map((runtimeId) => runtimeId.trim()).filter(Boolean));
  const runtimeEvidence = senaRuntimeProvenance.parityEvidence
    .filter((evidence) => requestedRuntimeIds.size === 0 || requestedRuntimeIds.has(evidence.id))
    .map((evidence) => ({
      id: evidence.id,
      referenceRuntime: evidence.referenceRuntime,
      fixturePath: evidence.fixturePath,
      status: evidence.status,
      coverage: evidence.coverage,
      sampleHash: artifactSha256(evidence.sample),
      interpretation: evidence.interpretation
    }));
  const jenaParity = runtimeEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity");
  const jsnaParity = runtimeEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity");
  const walkthroughLabel = input.parityEvidence?.walkthroughDatasetLabel?.trim() || "missing walkthrough dataset";
  const walkthroughHash = input.parityEvidence?.walkthroughDatasetHash?.trim();
  const walkthroughStatus: SenaEnterpriseValidationParityEvidence["walkthrough"]["status"] = walkthroughHash ? "attached" : "missing";
  const walkthroughSource: SenaEnterpriseValidationParityEvidence["walkthrough"]["source"] = walkthroughHash
    ? input.parityEvidence?.walkthroughSource ?? "input"
    : "missing";
  const walkthroughSourceId = input.parityEvidence?.walkthroughSourceId?.trim();
  const expertReviewRequired = input.parityEvidence?.expertReviewRequired ?? true;
  const studySpecificInferenceReference = input.parityEvidence?.studySpecificInferenceReference?.trim();
  const inference: SenaEnterpriseValidationParityEvidence["inference"] = {
    resultSchemaVersion: input.result.schemaVersion,
    guardrail: input.result.guardrail,
    comparisonCount: suite?.comparisonCount ?? 1,
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    alpha: suite?.alpha,
    correction: suite?.correction,
    studySpecificInferenceReference
  };
  const gates: SenaEnterpriseValidationParityEvidence["gates"] = [
    {
      id: "rena-parity",
      label: "jENA/rENA parity fixture evidence",
      status: jenaParity?.status === "covered" ? "passed" : "missing",
      evidence: jenaParity ? [
        `runtime=${jenaParity.referenceRuntime}`,
        `fixture=${jenaParity.fixturePath}`,
        `coverage=${jenaParity.coverage.join("|")}`,
        `sampleHash=${jenaParity.sampleHash}`
      ] : ["runtimeParity=missing"]
    },
    {
      id: "r-sna-parity",
      label: "jSNA/R sna parity fixture evidence",
      status: jsnaParity?.status === "covered" ? "passed" : "missing",
      evidence: jsnaParity ? [
        `runtime=${jsnaParity.referenceRuntime}`,
        `fixture=${jsnaParity.fixturePath}`,
        `coverage=${jsnaParity.coverage.join("|")}`,
        `sampleHash=${jsnaParity.sampleHash}`
      ] : ["runtimeParity=missing"]
    },
    {
      id: "real-data-walkthrough",
      label: "Real dataset walkthrough evidence",
      status: walkthroughStatus === "attached" ? "passed" : "missing",
      evidence: [
        `datasetLabel=${walkthroughLabel}`,
        `datasetHash=${walkthroughHash ?? "missing"}`,
        `source=${walkthroughSource}`,
        ...(walkthroughSourceId ? [`sourceId=${walkthroughSourceId}`] : [])
      ]
    },
    {
      id: "domain-expert-review",
      label: "Domain expert review requirement",
      status: expertReviewRequired ? "required" : "attached",
      evidence: [`required=${expertReviewRequired}`]
    },
    {
      id: "study-specific-inference",
      label: "Study-specific inferential model requirement",
      status: studySpecificInferenceReference ? "attached" : "required",
      evidence: [
        `reference=${studySpecificInferenceReference || "required-before-publication-claim"}`,
        `guardrail=${input.result.guardrail}`
      ]
    }
  ];
  const passedFoundation = gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity" || gate.id === "real-data-walkthrough")
    .every((gate) => gate.status === "passed");
  const formalInference = buildFormalInferenceReadiness({
    result: input.result,
    preregistrationPlan: input.preregistrationPlan,
    inference,
    gates
  });
  const notes = [
    "This manifest links an enterprise validation run to runtime parity, walkthrough, expert-review, and inference guardrail evidence.",
    "Required expert-review and study-specific inference gates are claim-readiness requirements, not automatic blockers for storing descriptive validation output.",
    ...(input.parityEvidence?.notes?.map((note) => note.trim()).filter(Boolean) ?? [])
  ];
  const manifestBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationParityEvidence,
    hashAlgorithm: "sha256" as const,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    runtimeParity: runtimeEvidence,
    walkthrough: {
      datasetLabel: walkthroughLabel,
      datasetHash: walkthroughHash,
      source: walkthroughSource,
      sourceId: walkthroughSourceId,
      status: walkthroughStatus
    },
    inference,
    formalInference,
    gates,
    notes
  };
  return {
    ...manifestBody,
    status: passedFoundation ? "ready-for-review" : "incomplete",
    validationRunHash: artifactSha256(manifestBody)
  };
}

export function createEnterpriseValidationRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  projectId?: string;
  preregistrationNote?: string;
  methodNote?: string;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
  result: SenaGroupComparisonValidationResult;
}) {
  requireEnterprisePermission(context, input.teamId, "analysis:run");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  let project: SenaEnterpriseProject | undefined;
  if (input.projectId) {
    project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Validation run team does not match the project team.", 400, "validation_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "analysis:run");
  }
  const summary = validationRunSummary(input.result);
  const primary = summary.primary;
  const preregistrationPlan = buildValidationPreregistrationPlan({
    result: input.result,
    preregistrationNote: input.preregistrationNote,
    methodNote: input.methodNote
  });
  const derivedParityEvidence = deriveValidationParityEvidenceFromProject(db, project);
  const parityEvidence = buildValidationParityEvidence({
    result: input.result,
    preregistrationPlan,
    parityEvidence: mergeValidationParityEvidenceInput(derivedParityEvidence, input.parityEvidence)
  });

  const run: SenaEnterpriseValidationRun = {
    id: id("val"),
    teamId: input.teamId,
    projectId: input.projectId,
    userId: context.user.id,
    status: "pending-review",
    preregistrationNote: input.preregistrationNote?.trim() ?? "",
    methodNote: input.methodNote?.trim() || input.result.guardrail,
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: summary.comparisonCount,
    minHolmAdjustedP: summary.minHolmAdjustedP,
    significantHolmCount: summary.significantHolmCount,
    observedDifference: primary.observedDifference,
    preregistrationPlan,
    parityEvidence,
    result: input.result,
    createdAt: now()
  };
  db.validationRuns.unshift(run);
  db.validationRuns = db.validationRuns.slice(0, 1000);
  appendAudit(db, {
    event: "inference.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      validationRunId: run.id,
      metric: run.metric,
      groupField: run.groupField,
      groupA: run.groupA,
      groupB: run.groupB,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null,
      preregistrationPlanHash: run.preregistrationPlan?.planHash ?? null,
      parityEvidenceHash: run.parityEvidence?.validationRunHash ?? null,
      parityEvidenceStatus: run.parityEvidence?.status ?? null
    }
  });
  saveDb(db);
  return run;
}

export function reviewEnterpriseValidationRun(context: SenaEnterpriseSessionContext, runId: string, input: {
  status: Extract<SenaEnterpriseValidationRunStatus, "approved" | "rejected">;
  notes?: string;
}) {
  const db = readEnterpriseDb();
  const run = db.validationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Validation run was not found.", 404, "validation_run_not_found");
  requireEnterprisePermission(context, run.teamId, "analysis:run");
  run.status = input.status;
  run.reviewerId = context.user.id;
  run.reviewedAt = now();
  run.reviewNotes = input.notes?.trim() ?? "";
  appendAudit(db, {
    event: "validation.review",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      validationRunId: run.id,
      status: run.status,
      metric: run.metric,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null
    }
  });
  queueEnterpriseNotification(db, {
    kind: "validation.review",
    userId: run.userId,
    teamId: run.teamId,
    projectId: run.projectId,
    title: "Group-comparison validation reviewed",
    body: `${context.user.name} marked a validation run as ${run.status}.`,
    actionUrl: run.projectId ? `/workspace/sena?projectId=${encodeURIComponent(run.projectId)}` : "/workspace/sena",
    detail: {
      validationRunId: run.id,
      status: run.status,
      reviewerId: context.user.id
    }
  });
  saveDb(db);
  return run;
}

export function listEnterpriseValidationRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("analysis:run"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "analysis:run");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "analysis:run");
    teamIds = new Set([project.teamId]);
  }

  return db.validationRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function clampReviewRating(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function normalizeExpertReviewStatus(value: unknown): SenaEnterpriseExpertReviewStatus {
  if (value === "approved" || value === "changes-requested" || value === "rejected") return value;
  return "requested";
}

function normalizeExpertClaimScope(value: unknown): SenaEnterpriseExpertReview["claimScope"] {
  if (value === "claim-ready-with-limits" || value === "not-claim-ready") return value;
  return "exploratory-only";
}

function validateExpertReviewTarget(db: SenaEnterpriseDb, projectId: string, target: SenaEnterpriseExpertReview["target"]) {
  if (target.kind === "validation-run" && target.id) {
    const run = db.validationRuns.find((candidate) => candidate.id === target.id && candidate.projectId === projectId);
    if (!run) throw new SenaEnterpriseError("Expert review validation target was not found for this project.", 404, "expert_validation_target_not_found");
  }
  if (target.kind === "reliability-run" && target.id) {
    const run = db.reliabilityRuns.find((candidate) => candidate.id === target.id && candidate.projectId === projectId);
    if (!run) throw new SenaEnterpriseError("Expert review reliability target was not found for this project.", 404, "expert_reliability_target_not_found");
  }
}

export function createEnterpriseExpertReview(context: SenaEnterpriseSessionContext, input: {
  projectId: string;
  target?: Partial<SenaEnterpriseExpertReview["target"]>;
  reviewerName?: string;
  reviewerRole?: string;
  expertiseArea?: string;
  status?: SenaEnterpriseExpertReviewStatus;
  claimScope?: SenaEnterpriseExpertReview["claimScope"];
  ratings?: Partial<SenaEnterpriseExpertReview["ratings"]>;
  strengths?: string;
  concerns?: string;
  recommendations?: string;
  limitations?: string;
}) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "expert:review");
  const timestamp = now();
  const target: SenaEnterpriseExpertReview["target"] = {
    kind: input.target?.kind === "validation-run" || input.target?.kind === "reliability-run" || input.target?.kind === "claim"
      ? input.target.kind
      : "project",
    id: input.target?.id?.trim() || undefined,
    label: input.target?.label?.trim() || undefined
  };
  validateExpertReviewTarget(db, project.id, target);
  const status = normalizeExpertReviewStatus(input.status);
  const review: SenaEnterpriseExpertReview = {
    id: id("expert"),
    teamId: project.teamId,
    projectId: project.id,
    userId: context.user.id,
    status,
    target,
    reviewerName: input.reviewerName?.trim() || context.user.name,
    reviewerRole: input.reviewerRole?.trim() || "Domain expert reviewer",
    expertiseArea: input.expertiseArea?.trim() || "SENA interpretation and study-domain review",
    claimScope: normalizeExpertClaimScope(input.claimScope),
    ratings: {
      dataAdequacy: clampReviewRating(input.ratings?.dataAdequacy),
      methodFit: clampReviewRating(input.ratings?.methodFit),
      interpretationValidity: clampReviewRating(input.ratings?.interpretationValidity)
    },
    strengths: input.strengths?.trim() ?? "",
    concerns: input.concerns?.trim() ?? "",
    recommendations: input.recommendations?.trim() ?? "",
    limitations: input.limitations?.trim() ?? "",
    reviewedAt: status === "requested" ? undefined : timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.expertReviews.unshift(review);
  db.expertReviews = db.expertReviews.slice(0, 1000);
  appendAudit(db, {
    event: "expert.review",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope,
      target: review.target.kind,
      dataAdequacy: review.ratings.dataAdequacy,
      methodFit: review.ratings.methodFit,
      interpretationValidity: review.ratings.interpretationValidity
    }
  });
  notifyProjectReaders(db, project, {
    kind: "expert.review",
    title: "Domain expert review recorded",
    body: `${context.user.name} recorded a domain expert review for ${project.title}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(project.id)}`,
    excludeUserId: context.user.id,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope
    }
  });
  saveDb(db);
  return review;
}

export function reviewEnterpriseExpertReview(context: SenaEnterpriseSessionContext, reviewId: string, input: {
  status?: SenaEnterpriseExpertReviewStatus;
  claimScope?: SenaEnterpriseExpertReview["claimScope"];
  ratings?: Partial<SenaEnterpriseExpertReview["ratings"]>;
  strengths?: string;
  concerns?: string;
  recommendations?: string;
  limitations?: string;
}) {
  const db = readEnterpriseDb();
  const review = db.expertReviews.find((candidate) => candidate.id === reviewId);
  if (!review) throw new SenaEnterpriseError("Expert review was not found.", 404, "expert_review_not_found");
  requireEnterprisePermission(context, review.teamId, "expert:review");
  const nextStatus = input.status ? normalizeExpertReviewStatus(input.status) : review.status;
  review.status = nextStatus;
  review.claimScope = input.claimScope ? normalizeExpertClaimScope(input.claimScope) : review.claimScope;
  if (input.ratings) {
    review.ratings = {
      dataAdequacy: input.ratings.dataAdequacy === undefined ? review.ratings.dataAdequacy : clampReviewRating(input.ratings.dataAdequacy),
      methodFit: input.ratings.methodFit === undefined ? review.ratings.methodFit : clampReviewRating(input.ratings.methodFit),
      interpretationValidity: input.ratings.interpretationValidity === undefined ? review.ratings.interpretationValidity : clampReviewRating(input.ratings.interpretationValidity)
    };
  }
  if (input.strengths !== undefined) review.strengths = input.strengths.trim();
  if (input.concerns !== undefined) review.concerns = input.concerns.trim();
  if (input.recommendations !== undefined) review.recommendations = input.recommendations.trim();
  if (input.limitations !== undefined) review.limitations = input.limitations.trim();
  review.updatedAt = now();
  if (review.status !== "requested") review.reviewedAt = review.updatedAt;
  appendAudit(db, {
    event: "expert.review",
    userId: context.user.id,
    teamId: review.teamId,
    projectId: review.projectId,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope,
      dataAdequacy: review.ratings.dataAdequacy,
      methodFit: review.ratings.methodFit,
      interpretationValidity: review.ratings.interpretationValidity
    }
  });
  queueEnterpriseNotification(db, {
    kind: "expert.review",
    userId: review.userId,
    teamId: review.teamId,
    projectId: review.projectId,
    title: "Domain expert review updated",
    body: `${context.user.name} marked a domain expert review as ${review.status}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(review.projectId)}`,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope
    }
  });
  saveDb(db);
  return review;
}

export function listEnterpriseExpertReviews(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("project:read"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "project:read");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "project:read");
    teamIds = new Set([project.teamId]);
  }

  return db.expertReviews
    .filter((review) => teamIds.has(review.teamId))
    .filter((review) => !input.projectId || review.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function claimEvidenceStatus<T extends { status: string }>(
  records: T[],
  approved: T | undefined
): "approved" | "missing" | "pending-or-rejected" {
  if (approved) return "approved";
  return records.length === 0 ? "missing" : "pending-or-rejected";
}

function latestByTimestamp<T extends { createdAt: string; updatedAt?: string }>(records: T[]) {
  return records
    .slice()
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}

function validationCorrection(run: SenaEnterpriseValidationRun): "holm" | undefined {
  return run.result.schemaVersion === "sena-group-comparison-suite/v1" ? run.result.correction : undefined;
}

function claimPackageSourceSnapshotEvidence(
  project: SenaEnterpriseProject,
  revision: SenaEnterpriseProjectRevision | undefined
): SenaEnterpriseClaimEvidencePackage["sourceSnapshotEvidence"] {
  const activeWindow = project.snapshot.source.activeTemporalWindow;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseClaimSourceSnapshot,
    projectVersion: project.currentVersion,
    revisionId: revision?.id,
    revisionCreatedAt: revision?.createdAt,
    revisionMatchesCurrentVersion: revision?.version === project.currentVersion,
    snapshotSchemaVersion: project.snapshot.schemaVersion,
    snapshotTitle: project.title,
    snapshotGeneratedAt: project.snapshot.generatedAt,
    snapshotSha256: artifactSha256(project.snapshot),
    reportSha256: artifactSha256(project.snapshot.report),
    dataGovernance: project.snapshot.report.dataGovernance,
    datasetCounts: project.datasetCounts,
    buildOptions: project.snapshot.reproducibility.buildOptions,
    activeTemporalWindow: activeWindow
      ? {
          id: activeWindow.id,
          label: activeWindow.label,
          mode: activeWindow.mode,
          index: activeWindow.index,
          startTurn: activeWindow.startTurn,
          endTurn: activeWindow.endTurn
        }
      : null,
    matrixFingerprints: project.snapshot.report.fusionMathAudit.matrixFingerprints.map((fingerprint) => ({
      id: fingerprint.id,
      label: fingerprint.label,
      shape: fingerprint.shape,
      checksumAlgorithm: fingerprint.checksumAlgorithm,
      checksum: fingerprint.checksum,
      sha256: artifactSha256(fingerprint)
    }))
  };
}

export function getEnterpriseClaimEvidencePackage(
  context: SenaEnterpriseSessionContext,
  input: { projectId: string }
): SenaEnterpriseClaimEvidencePackage {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "project:read");
  const currentRevision = db.projectRevisions.find((revision) => (
    revision.projectId === project.id && revision.version === project.currentVersion
  ));
  const projectReliabilityRuns = db.reliabilityRuns.filter((run) => run.projectId === project.id);
  const projectValidationRuns = db.validationRuns.filter((run) => run.projectId === project.id);
  const projectExpertReviews = db.expertReviews.filter((review) => review.projectId === project.id);
  const approvedReliability = latestByTimestamp(projectReliabilityRuns.filter((run) => run.status === "approved"));
  const approvedExpertReview = latestByTimestamp(projectExpertReviews.filter((review) => review.status === "approved"));
  const approvedValidationRuns = projectValidationRuns.filter((run) => run.status === "approved");
  const expertValidationTargetId = approvedExpertReview?.target.kind === "validation-run" ? approvedExpertReview.target.id : undefined;
  const approvedValidation = expertValidationTargetId
    ? approvedValidationRuns.find((run) => run.id === expertValidationTargetId) ?? latestByTimestamp(approvedValidationRuns)
    : latestByTimestamp(approvedValidationRuns);
  const reliabilityAdjudications = approvedReliability
    ? db.adjudications.filter((record) => record.reliabilityRunId === approvedReliability.id).length
    : 0;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!approvedReliability) blockers.push("approved-reliability-run-required");
  if (approvedReliability?.adjudicationCoverage.unresolvedDisagreements) {
    blockers.push("approved-reliability-adjudication-coverage-required");
  }
  if (!approvedValidation) blockers.push("approved-validation-run-required");
  if (approvedValidation && !approvedValidation.preregistrationPlan) blockers.push("validation-preregistration-plan-required");
  if (!approvedExpertReview) blockers.push("approved-domain-expert-review-required");
  if (approvedExpertReview && approvedExpertReview.claimScope !== "claim-ready-with-limits") {
    blockers.push("domain-expert-claim-ready-with-limits-required");
  }
  if (approvedValidation?.preregistrationPlan?.guardrail) warnings.push(approvedValidation.preregistrationPlan.guardrail);
  warnings.push("enterprise-claim-package-is-evidence-aggregation-not-causal-inference");

  const evidence: SenaEnterpriseClaimEvidencePackage["evidence"] = {};
  if (approvedReliability) {
    evidence.reliability = {
      runId: approvedReliability.id,
      status: approvedReliability.status,
      reviewer: approvedReliability.reviewer,
      coderCount: approvedReliability.coderCount,
      itemCount: approvedReliability.itemCount,
      codeCount: approvedReliability.codeCount,
      meanPairwiseKappa: approvedReliability.meanPairwiseKappa,
      krippendorffAlphaNominal: approvedReliability.krippendorffAlphaNominal,
      disagreementCount: approvedReliability.disagreementCount,
      adjudications: reliabilityAdjudications,
      adjudicationCoverage: approvedReliability.adjudicationCoverage,
      reviewedAt: approvedReliability.reviewedAt
    };
  }
  if (approvedValidation) {
    evidence.validation = {
      runId: approvedValidation.id,
      status: approvedValidation.status,
      analysis: approvedValidation.preregistrationPlan?.analysis ?? "unplanned",
      metric: approvedValidation.metric,
      groupField: approvedValidation.groupField,
      groupA: approvedValidation.groupA,
      groupB: approvedValidation.groupB,
      pTwoSided: approvedValidation.pTwoSided,
      observedDifference: approvedValidation.observedDifference,
      comparisonCount: approvedValidation.comparisonCount ?? 1,
      minHolmAdjustedP: approvedValidation.minHolmAdjustedP,
      significantHolmCount: approvedValidation.significantHolmCount,
      preregistrationPlanHash: approvedValidation.preregistrationPlan?.planHash,
      parityEvidence: approvedValidation.parityEvidence,
      suiteCorrection: validationCorrection(approvedValidation),
      reviewedAt: approvedValidation.reviewedAt
    };
  }
  if (approvedExpertReview) {
    evidence.expertReview = {
      reviewId: approvedExpertReview.id,
      status: approvedExpertReview.status,
      claimScope: approvedExpertReview.claimScope,
      reviewerName: approvedExpertReview.reviewerName,
      reviewerRole: approvedExpertReview.reviewerRole,
      expertiseArea: approvedExpertReview.expertiseArea,
      ratings: approvedExpertReview.ratings,
      target: approvedExpertReview.target,
      reviewedAt: approvedExpertReview.reviewedAt
    };
  }

  const artifacts: SenaEnterpriseClaimEvidencePackage["artifacts"] = [];
  if (approvedReliability) {
    artifacts.push({
      id: "reliability-dashboard",
      schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
      sourceId: approvedReliability.id,
      status: approvedReliability.status
    });
  }
  if (approvedValidation?.preregistrationPlan) {
    artifacts.push({
      id: "validation-preregistration-plan",
      schemaVersion: approvedValidation.preregistrationPlan.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.status
    });
  }
  if (approvedValidation?.parityEvidence) {
    artifacts.push({
      id: "validation-parity-evidence",
      schemaVersion: approvedValidation.parityEvidence.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.parityEvidence.status
    });
    artifacts.push({
      id: "formal-inference-readiness",
      schemaVersion: approvedValidation.parityEvidence.formalInference.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.parityEvidence.formalInference.status
    });
  }
  if (approvedExpertReview) {
    artifacts.push({
      id: "domain-expert-review",
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseExpertReview,
      sourceId: approvedExpertReview.id,
      status: approvedExpertReview.status
    });
  }

  const status: SenaEnterpriseClaimEvidencePackageStatus = blockers.length === 0
    ? "claim-ready-with-limits"
    : approvedExpertReview?.claimScope === "not-claim-ready"
      ? "not-claim-ready"
      : "exploratory-only";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage,
    generatedAt: now(),
    status,
    project: {
      id: project.id,
      teamId: project.teamId,
      title: project.title,
      currentVersion: project.currentVersion,
      claimUse: project.claimUse,
      activeWindowLabel: project.activeWindowLabel,
      datasetCounts: project.datasetCounts
    },
    sourceSnapshotEvidence: claimPackageSourceSnapshotEvidence(project, currentRevision),
    summary: {
      reliability: claimEvidenceStatus(projectReliabilityRuns, approvedReliability),
      validation: claimEvidenceStatus(projectValidationRuns, approvedValidation),
      expertReview: claimEvidenceStatus(projectExpertReviews, approvedExpertReview),
      blockers: blockers.length,
      warnings: warnings.length
    },
    blockers,
    warnings,
    evidence,
    artifacts,
    guardrails: [
      "Claim readiness is limited to the approved project evidence in this package and does not replace study-level preregistration or institutional review.",
      "Treat SENA network patterns as exploratory unless the approved expert review, reliability evidence, and validation plan all support the stated claim scope.",
      "This package aggregates persisted enterprise evidence; it does not rerun analysis or alter project state."
    ]
  };
}

export function recordEnterpriseAudit(entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  const db = readEnterpriseDb();
  appendAudit(db, entry);
  saveDb(db);
}

export function getEnterpriseOpsStatus(): SenaEnterpriseOpsStatus {
  const db = readEnterpriseDb();
  const generatedAt = now();
  const configuredDirectory = process.env.SENA_ENTERPRISE_DB_DIR ? "env-configured" : "default-local";
  const postgresConfig = resolveEnterprisePostgresConfig();
  const storageEngine = enterprisePostgresStorageEngine(postgresConfig);
  const postgresStorage = enterprisePostgresStorageEvidence(postgresConfig);
  const storageProbe = storageWriteProbe();
  const lockProbe = storageLockProbe();
  const fileStats = dbFileStats();
  const uploadStorageVerification = verifyEnterpriseUploadStorage();
  const lastBackupAt = latestAuditAt(db, "governance.backup");
  const lastVerifiedAt = latestAuditAt(db, "governance.backup.verify");
  const backupAge = backupAgeSeconds(lastBackupAt);
  const backupWarningHours = positiveIntegerEnv("SENA_OPS_BACKUP_WARNING_HOURS", 24);
  const backupStatus = backupAge === null
    ? "missing"
    : backupAge > backupWarningHours * 60 * 60 ? "stale" : "fresh";
  const activePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now()).length;
  const activeAuthLockouts = (db.authLockouts ?? []).filter((lockout) => isAuthLockoutActive(lockout)).length;
  const activeApiRateLimitBuckets = pruneApiRateLimits(db).length;
  const provisionedUsers = db.users.filter((user) => user.provisioning).length;
  const provisionedTeams = db.teams.filter((team) => team.provisioning).length;
  const provisionedMemberships = db.memberships.filter((membership) => membership.provisioning).length;
  const notificationWebhookConfigured = notificationWebhookProvider().configured;
  const emailWebhookConfigured = emailWebhookProvider().configured;
  const collaborationProvider = collaborationPubSubProvider();
  const collaborationPubSubWebhookConfigured = collaborationProvider.configured;
  const databaseSyncProvider = databaseSyncWebhookProvider();
  const databaseSyncWebhookConfigured = databaseSyncProvider.configured;
  const objectStorageProvider = objectStorageWebhookProvider();
  const objectStorageWebhookConfigured = objectStorageProvider.configured;
  const backupProvider = backupWebhookProvider();
  const backupWebhookConfigured = backupProvider.configured;
  const alertProvider = alertWebhookProvider();
  const alertWebhookConfigured = alertProvider.configured;
  const auditWebhookConfigured = auditWebhookProvider().configured;
  const emailPendingWebhook = (db.emailDeliveries ?? []).filter((entry) => entry.status === "pending").length;
  const emailFailedWebhook = (db.emailDeliveries ?? []).filter((entry) => entry.status === "failed").length;
  const auditPendingWebhook = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "pending").length;
  const auditFailedWebhook = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "failed").length;
  const collaborationPubSubPending = (db.collaborationEvents ?? []).filter((entry) => entry.delivery.status === "pending").length;
  const collaborationPubSubFailed = (db.collaborationEvents ?? []).filter((entry) => entry.delivery.status === "failed").length;
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "ops-storage-readable",
      label: "Enterprise storage readable",
      status: fileStats.dbFileExists ? "pass" : "review",
      evidence: [
        `dbFileExists=${fileStats.dbFileExists}`,
        `dbBytes=${fileStats.dbBytes}`,
        `dbUpdatedAt=${fileStats.dbUpdatedAt ?? "missing"}`
      ],
      nextAction: fileStats.dbFileExists ? "Keep the enterprise data file on managed storage." : "Initialize enterprise storage before production monitoring is marked ready."
    },
    {
      id: "ops-storage-writable",
      label: "Enterprise storage writable",
      status: storageProbe.writable ? "pass" : "review",
      evidence: [
        `writeProbe=${storageProbe.writeProbe}`,
        `writeErrorHash=${storageProbe.writeErrorHash ?? "none"}`
      ],
      nextAction: storageProbe.writable ? "Continue monitoring write probes from the deployment platform." : "Fix enterprise data directory write permissions."
    },
    {
      id: "ops-storage-lock",
      label: "Enterprise storage write lock",
      status: lockProbe.lockProbe === "pass" ? "pass" : "review",
      evidence: [
        `lockProbe=${lockProbe.lockProbe}`,
        `lockTimeoutMs=${lockProbe.lockTimeoutMs}`,
        `lockErrorHash=${lockProbe.lockErrorHash ?? "none"}`
      ],
      nextAction: lockProbe.lockProbe === "pass" ? "Keep the lock file path on shared durable storage for single-runtime deployments." : "Clear stale locks or move enterprise storage to a lock-capable managed adapter."
    },
    {
      id: "ops-write-before-backup",
      label: "Enterprise write-before backup",
      status: fileStats.dbBackupExists ? "pass" : "review",
      evidence: [
        `backupExists=${fileStats.dbBackupExists}`,
        `backupBytes=${fileStats.dbBackupBytes}`,
        `backupUpdatedAt=${fileStats.dbBackupUpdatedAt ?? "missing"}`
      ],
      nextAction: fileStats.dbBackupExists ? "Keep write-before backup plus scheduled team-scoped backup verification active." : "Perform at least one write after initialization so the local write-before backup exists."
    },
    {
      id: "ops-upload-storage-integrity",
      label: "Upload blob storage integrity",
      status: uploadStorageVerification.status,
      evidence: [
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`,
        `reviewed=${uploadStorageVerification.summary.reviewedUploads}`
      ],
      nextAction: uploadStorageVerification.status === "pass" ? "Keep upload blob verification in deployment monitoring." : "Repair missing/corrupt/orphan upload blobs before production handoff."
    },
    {
      id: "ops-database-sync-webhook",
      label: "Managed database sync webhook",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `databaseSyncWebhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `secret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${databaseSyncProvider.timeoutMs}`
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep signed database sync delivery connected to the managed database adapter."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before relying on external managed database mirroring."
    },
    ...(postgresConfig.adapterRequested ? [{
      id: "ops-native-postgres-adapter",
      label: "Native Postgres managed database adapter",
      status: postgresConfig.configured ? "pass" : "review",
      evidence: enterprisePostgresPublicEvidence(postgresConfig),
      nextAction: postgresConfig.configured
        ? "Run the live Neon/Postgres adapter probe during release verification and keep the connection string in the deployment secret store."
        : "Set SENA_ENTERPRISE_DB_ADAPTER=neon and a Vercel/Neon Postgres URL before claiming native database readiness."
    } satisfies SenaEnterpriseGovernanceCheck] : []),
    {
      id: "ops-object-storage-webhook",
      label: "Managed object storage delivery webhook",
      status: objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `objectStorageWebhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `secret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${objectStorageProvider.timeoutMs}`
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Keep signed upload blob delivery connected to managed object storage."
        : "Set SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET before relying on external upload blob handoff."
    },
    {
      id: "ops-collaboration-pubsub",
      label: "Collaboration pub/sub webhook queue",
      status: collaborationProvider.configured && collaborationProvider.secretConfigured && collaborationPubSubFailed === 0 ? "pass" : "review",
      evidence: [
        `pubsubWebhook=${collaborationProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `secret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${collaborationPubSubPending}`,
        `failed=${collaborationPubSubFailed}`
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured && collaborationPubSubFailed === 0
        ? "Keep collaboration event delivery connected to the external pub/sub bus."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET, then replay failed collaboration events."
    },
    {
      id: "ops-backup-freshness",
      label: "Backup freshness",
      status: backupStatus === "fresh" ? "pass" : "review",
      evidence: [
        `status=${backupStatus}`,
        `lastBackupAt=${lastBackupAt ?? "missing"}`,
        `lastVerifiedAt=${lastVerifiedAt ?? "missing"}`,
        `backupAgeSeconds=${backupAge ?? "missing"}`,
        `warningAfterHours=${backupWarningHours}`
      ],
      nextAction: backupStatus === "fresh" ? "Keep scheduled backup verification active." : "Run and verify a fresh team-scoped backup before production handoff."
    },
    {
      id: "ops-backup-webhook",
      label: "Managed backup delivery webhook",
      status: backupProvider.configured && backupProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `backupWebhook=${backupProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${backupProvider.endpointHash ?? "none"}`,
        `secret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${backupProvider.timeoutMs}`
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep signed backup delivery connected to managed storage or a database bridge."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET before relying on external backup handoff."
    },
    {
      id: "ops-alert-webhook",
      label: "Alert delivery webhook",
      status: alertProvider.configured && alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `alertWebhook=${alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${alertProvider.endpointHash ?? "none"}`,
        `secret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${alertProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "webhookSchema=sena-enterprise-ops-alert-webhook/v1"
      ],
      nextAction: alertProvider.configured && alertProvider.secretConfigured
        ? "Keep signed alert delivery connected to the deployment incident channel."
        : "Set SENA_ALERT_WEBHOOK_URL and SENA_ALERT_WEBHOOK_SECRET before relying on external incident alerting."
    },
    {
      id: "ops-auth",
      label: "Ops endpoint access control",
      status: opsTokenConfigured() ? "pass" : "review",
      evidence: [
        `opsToken=${opsTokenConfigured() ? "configured" : "missing"}`,
        "fallback=session-required",
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics"
      ],
      nextAction: opsTokenConfigured() ? "Use the bearer token from the deployment monitor only." : "Set SENA_OPS_TOKEN before exposing ops endpoints to deployment monitoring."
    },
    {
      id: "ops-email-webhook-queue",
      label: "Email webhook queue",
      status: emailFailedWebhook === 0 ? "pass" : "review",
      evidence: [
        `emailWebhook=${emailWebhookConfigured ? "configured" : "missing"}`,
        `pending=${emailPendingWebhook}`,
        `failed=${emailFailedWebhook}`
      ],
      nextAction: emailFailedWebhook === 0
        ? "Keep email webhook delivery in deployment monitoring."
        : "Replay failed email webhook deliveries and investigate the institution email bridge."
    },
    {
      id: "ops-audit-webhook-queue",
      label: "Audit/SIEM webhook queue",
      status: auditFailedWebhook === 0 ? "pass" : "review",
      evidence: [
        `auditWebhook=${auditWebhookConfigured ? "configured" : "missing"}`,
        `pending=${auditPendingWebhook}`,
        `failed=${auditFailedWebhook}`
      ],
      nextAction: auditFailedWebhook === 0
        ? "Keep audit webhook delivery in deployment monitoring."
        : "Replay failed audit webhook deliveries and investigate SIEM endpoint health."
    }
  ];
  const status = !storageProbe.writable || lockProbe.lockProbe === "fail"
    ? "degraded"
    : checks.every((check) => check.status === "pass") ? "ready" : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsStatus,
    status,
    generatedAt,
    deployment: {
      nodeVersion: process.version,
      runtime: "nodejs",
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      opsTokenConfigured: opsTokenConfigured(),
      provisioningTokenConfigured: Boolean(envValue("SENA_PROVISIONING_TOKEN")),
      notificationWebhookConfigured,
      emailWebhookConfigured,
      collaborationPubSubWebhookConfigured,
      databaseSyncWebhookConfigured,
      objectStorageWebhookConfigured,
      backupWebhookConfigured,
      alertWebhookConfigured,
      auditWebhookConfigured
    },
    storage: {
      engine: storageEngine,
      configuredDirectory,
      pathHint: path.basename(dbDir),
      ...(postgresStorage ? { postgres: postgresStorage } : {}),
      ...fileStats,
      ...storageProbe,
      ...lockProbe
    },
    backup: {
      status: backupStatus,
      lastBackupAt,
      lastVerifiedAt,
      backupAgeSeconds: backupAge,
      warningAfterHours: backupWarningHours
    },
    queues: {
      notificationsPendingWebhook: db.notifications.filter((notification) => notification.webhookDelivery?.status === "pending").length,
      notificationsFailedWebhook: db.notifications.filter((notification) => notification.webhookDelivery?.status === "failed").length,
      emailPendingWebhook,
      emailFailedWebhook,
      auditPendingWebhook,
      auditFailedWebhook,
      collaborationPubSubPending,
      collaborationPubSubFailed,
      activePasswordResetRequests,
      activeAuthLockouts,
      activeApiRateLimitBuckets
    },
    counts: {
      users: db.users.length,
      teams: db.teams.length,
      projects: db.projects.length,
      uploads: db.uploads.length,
      importRuns: db.importRuns.length,
      analysisRuns: db.analysisRuns.length,
      reliabilityRuns: db.reliabilityRuns.length,
      validationRuns: db.validationRuns.length,
      expertReviews: db.expertReviews.length,
      platformDecisionAcceptances: (db.platformDecisionAcceptances ?? []).length,
      releaseGateReviews: (db.releaseGateReviews ?? []).length,
      postCutoverObservations: (db.postCutoverObservations ?? []).length,
      goLiveAttestations: (db.goLiveAttestations ?? []).length,
      projectRevisions: db.projectRevisions.length,
      comments: db.projectComments.length,
      adjudications: db.adjudications.length,
      collaborationEvents: (db.collaborationEvents ?? []).length,
      notifications: db.notifications.length,
      auditEvents: db.auditLog.length,
      sessions: db.sessions.length,
      provisionedUsers,
      provisionedTeams,
      provisionedMemberships
    },
    checks
  };
}

function metricLine(name: string, value: number, labels?: Record<string, string | number | boolean | undefined>) {
  const labelText = labels
    ? `{${Object.entries(labels)
      .filter(([, labelValue]) => labelValue !== undefined)
      .map(([key, labelValue]) => `${key}="${String(labelValue).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`)
      .join(",")}}`
    : "";
  return `${name}${labelText} ${Number.isFinite(value) ? value : 0}`;
}

const identityMetricsReadinessItemIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

export function buildEnterpriseOpsMetrics(
  status = getEnterpriseOpsStatus(),
  readiness = getEnterpriseDeploymentReadiness()
) {
  const ready = status.status === "ready" ? 1 : 0;
  const degraded = status.status === "degraded" ? 1 : 0;
  const identityReadinessItems = identityMetricsReadinessItemIds.map((id) => (
    readiness.blocking.find((item) => item.id === id)
  ));
  const identityReadinessBlockers = identityReadinessItems
    .filter((item) => item?.status !== "pass")
    .length;
  const lines = [
    "# HELP sena_enterprise_ready SENA enterprise runtime readiness.",
    "# TYPE sena_enterprise_ready gauge",
    metricLine("sena_enterprise_ready", ready, { status: status.status }),
    "# HELP sena_enterprise_degraded SENA enterprise runtime degraded state.",
    "# TYPE sena_enterprise_degraded gauge",
    metricLine("sena_enterprise_degraded", degraded),
    "# HELP sena_enterprise_storage_writable Enterprise storage write probe.",
    "# TYPE sena_enterprise_storage_writable gauge",
    metricLine("sena_enterprise_storage_writable", status.storage.writable ? 1 : 0),
    "# HELP sena_enterprise_storage_lock_healthy Enterprise database write lock probe.",
    "# TYPE sena_enterprise_storage_lock_healthy gauge",
    metricLine("sena_enterprise_storage_lock_healthy", status.storage.lockProbe === "pass" ? 1 : 0, { lock_timeout_ms: status.storage.lockTimeoutMs }),
    "# HELP sena_enterprise_write_backup_exists Whether the write-before backup file exists.",
    "# TYPE sena_enterprise_write_backup_exists gauge",
    metricLine("sena_enterprise_write_backup_exists", status.storage.dbBackupExists ? 1 : 0),
    "# HELP sena_enterprise_db_bytes Enterprise database JSON file size.",
    "# TYPE sena_enterprise_db_bytes gauge",
    metricLine("sena_enterprise_db_bytes", status.storage.dbBytes),
    "# HELP sena_enterprise_backup_age_seconds Age of the latest enterprise backup audit event.",
    "# TYPE sena_enterprise_backup_age_seconds gauge",
    metricLine("sena_enterprise_backup_age_seconds", status.backup.backupAgeSeconds ?? -1, { backup_status: status.backup.status }),
    "# HELP sena_enterprise_collaboration_pubsub_webhook_configured Whether SENA_COLLABORATION_PUBSUB_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_collaboration_pubsub_webhook_configured gauge",
    metricLine("sena_enterprise_collaboration_pubsub_webhook_configured", status.deployment.collaborationPubSubWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_database_sync_webhook_configured Whether SENA_DATABASE_SYNC_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_database_sync_webhook_configured gauge",
    metricLine("sena_enterprise_database_sync_webhook_configured", status.deployment.databaseSyncWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_object_storage_webhook_configured Whether SENA_OBJECT_STORAGE_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_object_storage_webhook_configured gauge",
    metricLine("sena_enterprise_object_storage_webhook_configured", status.deployment.objectStorageWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_backup_webhook_configured Whether SENA_BACKUP_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_backup_webhook_configured gauge",
    metricLine("sena_enterprise_backup_webhook_configured", status.deployment.backupWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_alert_webhook_configured Whether SENA_ALERT_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_alert_webhook_configured gauge",
    metricLine("sena_enterprise_alert_webhook_configured", status.deployment.alertWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_collection_records Enterprise collection record counts.",
    "# TYPE sena_enterprise_collection_records gauge",
    ...Object.entries(status.counts).map(([collection, count]) => metricLine("sena_enterprise_collection_records", count, { collection })),
    "# HELP sena_enterprise_queue_records Enterprise queue/status counters.",
    "# TYPE sena_enterprise_queue_records gauge",
    ...Object.entries(status.queues).map(([queue, count]) => metricLine("sena_enterprise_queue_records", count, { queue })),
    "# HELP sena_enterprise_ops_token_configured Whether SENA_OPS_TOKEN is configured.",
    "# TYPE sena_enterprise_ops_token_configured gauge",
    metricLine("sena_enterprise_ops_token_configured", status.deployment.opsTokenConfigured ? 1 : 0),
    "# HELP sena_enterprise_deployment_readiness_blocking_review Deployment readiness blocking checks in review.",
    "# TYPE sena_enterprise_deployment_readiness_blocking_review gauge",
    metricLine("sena_enterprise_deployment_readiness_blocking_review", readiness.summary.blockingReview, { readiness_status: readiness.status }),
    "# HELP sena_enterprise_identity_readiness_blockers Identity production readiness blockers from deployment readiness.",
    "# TYPE sena_enterprise_identity_readiness_blockers gauge",
    metricLine("sena_enterprise_identity_readiness_blockers", identityReadinessBlockers, { readiness_status: readiness.status }),
    "# HELP sena_enterprise_identity_readiness_item Identity production readiness item state.",
    "# TYPE sena_enterprise_identity_readiness_item gauge",
    ...identityMetricsReadinessItemIds.map((id, index) => metricLine(
      "sena_enterprise_identity_readiness_item",
      identityReadinessItems[index] ? 1 : 0,
      {
        item: id,
        status: identityReadinessItems[index]?.status ?? "missing"
      }
    )),
    ""
  ];
  return lines.join("\n");
}

function opsStatusAlertSeverity(checkId: string): SenaEnterpriseOpsAlert["severity"] {
  if ([
    "ops-storage-readable",
    "ops-storage-writable",
    "ops-storage-lock",
    "ops-write-before-backup",
    "ops-upload-storage-integrity"
  ].includes(checkId)) {
    return "critical";
  }
  return "warning";
}

function opsAlertStatus(alerts: SenaEnterpriseOpsAlert[]): SenaEnterpriseOpsAlerts["status"] {
  if (alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (alerts.some((alert) => alert.severity === "warning")) return "warning";
  return "clear";
}

export function getEnterpriseOpsAlerts(
  status = getEnterpriseOpsStatus(),
  readiness = getEnterpriseDeploymentReadiness()
): SenaEnterpriseOpsAlerts {
  const generatedAt = now();
  const owner = alertingOwner();
  const runbookUrl = alertingRunbookUrl();
  const ownerLabel = owner ?? "unassigned";
  const base = {
    owner: ownerLabel,
    runbookUrl,
    createdAt: generatedAt
  };
  const alerts: SenaEnterpriseOpsAlert[] = [];

  for (const check of status.checks) {
    if (check.status === "pass") continue;
    alerts.push({
      ...base,
      id: `ops-${check.id}`,
      label: check.label,
      severity: opsStatusAlertSeverity(check.id),
      status: "firing",
      source: "ops-status",
      evidence: check.evidence,
      nextAction: check.nextAction
    });
  }

  for (const item of readiness.blocking) {
    if (item.status === "pass") continue;
    alerts.push({
      ...base,
      id: `readiness-blocking-${item.id}`,
      label: item.label,
      severity: "critical",
      status: "firing",
      source: "deployment-readiness",
      evidence: item.evidence,
      nextAction: item.nextAction
    });
  }

  for (const item of readiness.advisory) {
    if (item.status === "pass") continue;
    alerts.push({
      ...base,
      id: `readiness-advisory-${item.id}`,
      label: item.label,
      severity: "warning",
      status: "firing",
      source: "deployment-readiness",
      evidence: item.evidence,
      nextAction: item.nextAction
    });
  }

  if (!owner) {
    alerts.push({
      ...base,
      id: "alerting-owner-missing",
      label: "Alerting owner assignment",
      severity: "critical",
      status: "firing",
      source: "alerting-ownership",
      evidence: [
        "owner=missing",
        "env=SENA_ALERTING_OWNER"
      ],
      nextAction: "Set SENA_ALERTING_OWNER to the operational rotation or named deployment owner before production handoff."
    });
  }

  if (!runbookUrl) {
    alerts.push({
      ...base,
      id: "alerting-runbook-missing",
      label: "Alerting runbook URL",
      severity: "warning",
      status: "firing",
      source: "alerting-ownership",
      evidence: [
        "runbookUrl=missing",
        "env=SENA_ALERTING_RUNBOOK_URL"
      ],
      nextAction: "Set SENA_ALERTING_RUNBOOK_URL to the incident response runbook used by deployment monitors."
    });
  }

  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;
  const info = alerts.filter((alert) => alert.severity === "info").length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlerts,
    generatedAt,
    status: opsAlertStatus(alerts),
    ownership: {
      configured: Boolean(owner),
      owner: ownerLabel,
      runbookUrl,
      channel: alertingChannel()
    },
    summary: {
      critical,
      warning,
      info,
      firing: alerts.length
    },
    alerts
  };
}

function opsAlertWebhookPayload(alerts: SenaEnterpriseOpsAlerts, endpointHash: string, generatedAt: string) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlertWebhook,
    generatedAt,
    alerts,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(alertWebhookSecret())
    }
  };
}

async function postOpsAlertWebhook(alerts: SenaEnterpriseOpsAlerts) {
  const webhookUrl = alertWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Alert webhook delivery is not configured.", 503, "alert_webhook_not_configured");
  }
  const endpointHash = alertWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(opsAlertWebhookPayload(alerts, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "ops.alert",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-ops-alert-status": alerts.status,
    "x-sena-ops-alert-firing": String(alerts.summary.firing),
    "x-sena-ops-alert-critical": String(alerts.summary.critical)
  };
  const secret = alertWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), alertWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseOpsAlerts(input: {
  status?: SenaEnterpriseOpsStatus;
  readiness?: SenaEnterpriseDeploymentReadiness;
} = {}): Promise<SenaEnterpriseOpsAlertDeliveryResult> {
  const provider = alertWebhookProvider();
  const alerts = getEnterpriseOpsAlerts(input.status, input.readiness);
  const result: SenaEnterpriseOpsAlertDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlertDelivery,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    alerts: {
      generatedAt: alerts.generatedAt,
      status: alerts.status,
      summary: alerts.summary,
      ownership: alerts.ownership
    },
    delivery: {
      attempted: false
    }
  };

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postOpsAlertWebhook(alerts);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.delivery = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "ops.alert.deliver" : "ops.alert.deliver.fail",
    detail: {
      status: alerts.status,
      firing: alerts.summary.firing,
      critical: alerts.summary.critical,
      warning: alerts.summary.warning,
      info: alerts.summary.info,
      ownerConfigured: alerts.ownership.configured,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null
    }
  });
  saveDb(db);
  return result;
}

function readinessItem(input: SenaEnterpriseDeploymentReadinessItem): SenaEnterpriseDeploymentReadinessItem {
  return input;
}

function governanceCheck(status: SenaEnterpriseGovernanceStatus, id: string) {
  return status.checks.find((check) => check.id === id);
}

function readinessFromGovernance(
  status: SenaEnterpriseGovernanceStatus,
  id: string,
  severity: SenaEnterpriseDeploymentReadinessItem["severity"],
  fallbackLabel: string,
  fallbackAction: string
) {
  const check = governanceCheck(status, id);
  return readinessItem({
    id,
    label: check?.label ?? fallbackLabel,
    severity,
    status: check?.status ?? "review",
    evidence: check?.evidence ?? ["governanceCheck=missing"],
    nextAction: check?.nextAction ?? fallbackAction
  });
}

export function getEnterpriseDeploymentReadiness(): SenaEnterpriseDeploymentReadiness {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const opsStatus = getEnterpriseOpsStatus();
  const governance = getEnterpriseGovernanceStatus();
  const uploadStorageVerification = verifyEnterpriseUploadStorage();
  const webhookProvider = notificationWebhookProvider();
  const emailProvider = emailWebhookProvider();
  const collaborationProvider = collaborationPubSubProvider();
  const databaseSyncProvider = databaseSyncWebhookProvider();
  const objectStorageProvider = objectStorageWebhookProvider();
  const backupProvider = backupWebhookProvider();
  const alertProvider = alertWebhookProvider();
  const auditProvider = auditWebhookProvider();
  const configuredOidcProviders = governance.auth.oidcProviders
    .filter((provider) => provider.configured)
    .map((provider) => provider.provider);
  const oidcGovernance = governanceCheck(governance, "oauth-oidc-sso");
  const provisioningTokenEvidence = provisioningTokenProductionEvidence();
  const identityEvidenceHostAllowlist = identityEvidenceAllowedHostConfig();
  const identityEvidenceHostAllowlistConfigured = identityEvidenceHostAllowlist.configured &&
    identityEvidenceHostAllowlist.hosts.length > 0 &&
    identityEvidenceHostAllowlist.invalidCount === 0;
  const identityEvidenceHostAllowlistRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityEvidenceHostAllowlistReady = !identityEvidenceHostAllowlistRequired || identityEvidenceHostAllowlistConfigured;
  const identityEvidenceHostAllowlistStatus = !identityEvidenceHostAllowlist.configured
    ? "not-configured"
    : identityEvidenceHostAllowlistConfigured
      ? "configured"
      : "invalid";
  const identitySecretVersionBindingRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const ssoClientSecretVersionConfigured = Boolean(envValue("SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION"));
  const provisioningTokenVersionConfigured = Boolean(envValue("SENA_PROVISIONING_TOKEN_VERSION"));
  const identitySecretVersionBindingReady = !identitySecretVersionBindingRequired ||
    (ssoClientSecretVersionConfigured && provisioningTokenVersionConfigured);
  const identitySsoSecretStoreReference = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
  const identityProvisioningSecretStoreReference = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
  const identitySecretStoreReferenceRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identitySecretStoreReferenceReady = !identitySecretStoreReferenceRequired ||
    (identitySsoSecretStoreReference.configured && identityProvisioningSecretStoreReference.configured);
  const identitySecretRotationCadence = identitySecretRotationCadenceBinding();
  const identitySecretRotationCadenceRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identitySecretRotationCadenceReady = !identitySecretRotationCadenceRequired || identitySecretRotationCadence.valid;
  const identityIdpTenantBinding = idpTenantBinding();
  const identityIdpTenantBindingRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityIdpTenantBindingReady = !identityIdpTenantBindingRequired || identityIdpTenantBinding.configured;
  const identityLifecycleOwnerMode = identityLifecycleOwnerModeBinding();
  const identityLifecycleOwnerModeRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityLifecycleOwnerModeReady = !identityLifecycleOwnerModeRequired || identityLifecycleOwnerMode.valid;

  const blocking: SenaEnterpriseDeploymentReadinessItem[] = [
    readinessItem({
      id: "storage-writable",
      label: "Enterprise storage write/read probe",
      severity: "blocking",
      status: opsStatus.storage.writable && opsStatus.storage.dbFileExists && opsStatus.storage.lockProbe === "pass" ? "pass" : "review",
      evidence: [
        `dbFileExists=${opsStatus.storage.dbFileExists}`,
        `storageWritable=${opsStatus.storage.writable}`,
        `writeProbe=${opsStatus.storage.writeProbe}`,
        `lockProbe=${opsStatus.storage.lockProbe}`,
        `lockTimeoutMs=${opsStatus.storage.lockTimeoutMs}`,
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`
      ],
      nextAction: opsStatus.storage.writable && opsStatus.storage.dbFileExists && opsStatus.storage.lockProbe === "pass"
        ? "Keep the configured enterprise data path on durable, backed-up storage."
        : "Fix enterprise storage before accepting production traffic."
    }),
    readinessItem({
      id: "write-before-backup",
      label: "Write-before backup exists",
      severity: "blocking",
      status: opsStatus.storage.dbBackupExists ? "pass" : "review",
      evidence: [
        `backupExists=${opsStatus.storage.dbBackupExists}`,
        `backupBytes=${opsStatus.storage.dbBackupBytes}`,
        `backupUpdatedAt=${opsStatus.storage.dbBackupUpdatedAt ?? "missing"}`
      ],
      nextAction: opsStatus.storage.dbBackupExists
        ? "Keep the write-before backup as local recovery support in addition to scheduled team backups."
        : "Perform a verified enterprise write after initialization so the local write-before backup is created."
    }),
    readinessItem({
      id: "managed-storage-path",
      label: "Managed enterprise data directory configured",
      severity: "blocking",
      status: opsStatus.storage.configuredDirectory === "env-configured" ? "pass" : "review",
      evidence: [
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`,
        `pathHint=${opsStatus.storage.pathHint}`
      ],
      nextAction: opsStatus.storage.configuredDirectory === "env-configured"
        ? "Document the backup and retention policy for the configured enterprise directory."
        : "Set SENA_ENTERPRISE_DB_DIR to a managed persistent path before production handoff."
    }),
    readinessItem({
      id: "ops-bearer-token",
      label: "Ops bearer token configured",
      severity: "blocking",
      status: opsStatus.deployment.opsTokenConfigured ? "pass" : "review",
      evidence: [
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics",
        "readinessApi=/api/sena/ops/readiness"
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured
        ? "Use this token only from deployment monitors and rotate it through the secret store."
        : "Set SENA_OPS_TOKEN before exposing ops endpoints."
    }),
    readinessItem({
      id: "backup-freshness",
      label: "Verified backup freshness",
      severity: "blocking",
      status: opsStatus.backup.status === "fresh" ? "pass" : "review",
      evidence: [
        `backupStatus=${opsStatus.backup.status}`,
        `lastBackupAt=${opsStatus.backup.lastBackupAt ?? "missing"}`,
        `lastVerifiedAt=${opsStatus.backup.lastVerifiedAt ?? "missing"}`,
        `backupAgeSeconds=${opsStatus.backup.backupAgeSeconds ?? "missing"}`
      ],
      nextAction: opsStatus.backup.status === "fresh"
        ? "Keep scheduled backup export, verify, and restore rehearsal active."
        : "Run backup export plus verification before production handoff."
    }),
    readinessItem({
      id: "backup-webhook",
      label: "Managed backup webhook and signing configured",
      severity: "blocking",
      status: backupProvider.configured && backupProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${backupProvider.mode}`,
        ...(backupProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${backupProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${backupProvider.endpointHash ?? "none"}`,
        `secret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${backupProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/governance/backup action=deliver"
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep scheduled signed backup delivery pointed at managed storage or the database bridge."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET before production backup handoff is claimed."
    }),
    readinessItem({
      id: "alert-webhook",
      label: "Alert delivery webhook and signing configured",
      severity: "blocking",
      status: alertProvider.configured && alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${alertProvider.mode}`,
        ...(alertProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${alertProvider.endpointHash ?? "none"}`,
        `secret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${alertProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "webhookSchema=sena-enterprise-ops-alert-webhook/v1"
      ],
      nextAction: alertProvider.configured && alertProvider.secretConfigured
        ? "Keep signed ops alerts connected to the deployment incident channel."
        : "Set SENA_ALERT_WEBHOOK_URL and SENA_ALERT_WEBHOOK_SECRET before production alert delivery is claimed."
    }),
    readinessItem({
      id: "database-sync-webhook",
      label: "Managed database sync webhook and signing configured",
      severity: "blocking",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${databaseSyncProvider.mode}`,
        ...(databaseSyncProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `secret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${databaseSyncProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/governance/backup action=sync-database",
        "webhookSchema=sena-enterprise-database-sync-webhook/v1"
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep signed sanitized enterprise-state sync pointed at the managed database adapter."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before production database mirroring is claimed."
    }),
    readinessItem({
      id: "object-storage-webhook",
      label: "Managed object storage webhook and signing configured",
      severity: "blocking",
      status: objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${objectStorageProvider.mode}`,
        ...(objectStorageProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `secret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${objectStorageProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/uploads action=deliver-object-storage",
        "webhookSchema=sena-enterprise-upload-object-storage-webhook/v1"
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Keep signed upload blob delivery pointed at managed object storage."
        : "Set SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET before production upload storage handoff is claimed."
    }),
    readinessItem({
      id: "collaboration-pubsub",
      label: "Collaboration pub/sub webhook and signing configured",
      severity: "blocking",
      status: collaborationProvider.configured && collaborationProvider.secretConfigured && opsStatus.queues.collaborationPubSubFailed === 0 ? "pass" : "review",
      evidence: [
        `provider=${collaborationProvider.mode}`,
        ...(collaborationProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${collaborationProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `secret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${collaborationProvider.timeoutMs}`,
        `maxAttempts=${collaborationProvider.maxAttempts}`,
        `pending=${opsStatus.queues.collaborationPubSubPending}`,
        `failed=${opsStatus.queues.collaborationPubSubFailed}`,
        "deliveryApi=POST:/api/sena/projects/:projectId/collaboration action=deliver-pubsub",
        "webhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1"
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured && opsStatus.queues.collaborationPubSubFailed === 0
        ? "Keep signed collaboration events connected to the external pub/sub bus."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET, then replay failed collaboration events before claiming multi-runtime collaboration delivery."
    }),
    readinessItem({
      id: "oidc-provider",
      label: "OAuth/OIDC provider configured and preflighted",
      severity: "blocking",
      status: selfManagedEnterprise || oidcGovernance?.status === "pass" ? "pass" : "review",
      evidence: selfManagedEnterprise
        ? selfManagedIdentityEvidence(["authMode=local"])
        : oidcGovernance?.evidence ?? governance.auth.oidcProviders.map((provider) => `${provider.provider}=${provider.configured ? "configured" : "missing"};mode=${provider.mode}`),
      nextAction: selfManagedEnterprise
        ? "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
        : oidcGovernance?.status === "pass"
        ? "Keep IdP tenant redirect URI approval and SSO preflight in deployment release checks."
        : "Configure SENA_SSO_* provider credentials and run /api/auth/sso?status=1&preflight=1 before production SSO is claimed."
    }),
    readinessItem({
      id: "provisioning-token",
      label: "Organization provisioning token configured",
      severity: "blocking",
      status: selfManagedEnterprise || provisioningTokenEvidence.ready ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence(["provisioningMode=manual-local"]) : provisioningTokenEvidence.evidence),
        `provisionedTeams=${opsStatus.counts.provisionedTeams}`,
        `provisionedUsers=${opsStatus.counts.provisionedUsers}`,
        `provisionedMemberships=${opsStatus.counts.provisionedMemberships}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep manual local membership and RBAC evidence current; SCIM/provisioning token evidence is not required for this self-managed deployment."
        : provisioningTokenEvidence.ready
        ? "Map the provisioning endpoint to the institution IdP or SCIM bridge."
        : provisioningTokenEvidence.present
          ? "Rotate SENA_PROVISIONING_TOKEN to a production secret-store value before institution-managed onboarding."
          : "Set SENA_PROVISIONING_TOKEN before institution-managed onboarding."
    }),
    readinessItem({
      id: "identity-evidence-host-allowlist",
      label: "Identity production evidence host allowlist configured",
      severity: "blocking",
      status: identityEvidenceHostAllowlistReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityEvidenceHostAllowlistRequired}`,
        `allowlist=${identityEvidenceHostAllowlistStatus}`,
        `allowedHosts=${identityEvidenceHostAllowlist.hosts.length}`,
        `invalidAllowedHosts=${identityEvidenceHostAllowlist.invalidCount}`,
        "evidenceUrlPolicy=sena-enterprise-identity-platform-decision-request-packet/v1"
      ],
      nextAction: identityEvidenceHostAllowlistReady
        ? "Keep SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS aligned with the institution-owned IdP/SCIM evidence system before production evidence acceptance."
        : identityEvidenceHostAllowlist.configured
          ? "Fix SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS so it contains only valid institution-owned evidence hosts before accepting IdP or SCIM production evidence."
          : "Set SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS before accepting institution IdP or SCIM production evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-version-binding",
      label: "Identity secret rotation version bindings configured",
      severity: "blocking",
      status: identitySecretVersionBindingReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretVersionBindingRequired}`,
        `ssoClientSecretVersion=${ssoClientSecretVersionConfigured ? "configured" : "missing"}`,
        `provisioningTokenVersion=${provisioningTokenVersionConfigured ? "configured" : "missing"}`,
        "secretValues=excluded",
        "versionValues=hashed-in-identity-production-evidence"
      ],
      nextAction: identitySecretVersionBindingReady
        ? "Keep non-secret SSO client-secret and provisioning-token version identifiers aligned with institution rotation evidence."
        : "Set SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION and SENA_PROVISIONING_TOKEN_VERSION before accepting institution secret-rotation production evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-store-reference",
      label: "Identity secret store references configured",
      severity: "blocking",
      status: identitySecretStoreReferenceReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretStoreReferenceRequired}`,
        `ssoClientSecretRef=${identitySsoSecretStoreReference.configured ? "configured" : "missing"}`,
        `provisioningTokenRef=${identityProvisioningSecretStoreReference.configured ? "configured" : "missing"}`,
        `ssoClientSecretRefHash=${identitySsoSecretStoreReference.referenceHash ? "present" : "missing"}`,
        `provisioningTokenRefHash=${identityProvisioningSecretStoreReference.referenceHash ? "present" : "missing"}`,
        `envs=${identitySsoSecretStoreReference.env}|${identityProvisioningSecretStoreReference.env}`,
        "secretValues=excluded"
      ],
      nextAction: identitySecretStoreReferenceReady
        ? "Keep non-secret secret-store references aligned with institution SSO and provisioning secret custody evidence."
        : "Set SENA_SSO_INSTITUTION_CLIENT_SECRET_REF and SENA_PROVISIONING_TOKEN_SECRET_REF before accepting institution identity secret custody evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-rotation-cadence",
      label: "Identity secret rotation cadence configured",
      severity: "blocking",
      status: identitySecretRotationCadenceReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretRotationCadenceRequired}`,
        `configured=${identitySecretRotationCadence.configured}`,
        `valid=${identitySecretRotationCadence.valid}`,
        `cadenceDays=${identitySecretRotationCadence.cadenceDays ?? "missing"}`,
        `minDays=${identitySecretRotationCadence.minDays}`,
        `maxDays=${identitySecretRotationCadence.maxDays}`,
        `cadenceHash=${identitySecretRotationCadence.cadenceHash ? "present" : "missing"}`,
        `env=${identitySecretRotationCadence.env}`
      ],
      nextAction: identitySecretRotationCadenceReady
        ? "Keep the identity rotation cadence aligned with institution SSO and bearer-token rotation evidence."
        : "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to an institution-approved value from 1 to 180 before accepting SSO or bearer-token rotation evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-idp-tenant-binding",
      label: "Institution IdP tenant binding configured",
      severity: "blocking",
      status: identityIdpTenantBindingReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityIdpTenantBindingRequired}`,
        `tenantBinding=${identityIdpTenantBinding.configured ? "configured" : "missing"}`,
        `tenantHash=${identityIdpTenantBinding.tenantHash ? "present" : "missing"}`,
        `env=${identityIdpTenantBinding.env}`,
        "secretValues=excluded"
      ],
      nextAction: identityIdpTenantBindingReady
        ? "Keep the IdP tenant identifier aligned with institution tenant approval evidence."
        : "Set SENA_SSO_INSTITUTION_TENANT_ID before accepting institution IdP tenant approval evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-lifecycle-owner-mode",
      label: "Identity lifecycle owner mode configured",
      severity: "blocking",
      status: identityLifecycleOwnerModeReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityLifecycleOwnerModeRequired}`,
        `mode=${identityLifecycleOwnerMode.mode ?? "missing"}`,
        `valid=${identityLifecycleOwnerMode.valid}`,
        `acceptedModes=${identityLifecycleOwnerMode.acceptedModes.join("|")}`,
        `env=${identityLifecycleOwnerMode.env}`
      ],
      nextAction: identityLifecycleOwnerModeReady
        ? "Keep the declared SCIM/IdP lifecycle owner mode aligned with institution provisioning evidence."
        : "Set SENA_IDENTITY_LIFECYCLE_OWNER_MODE to scim, idp, or hybrid before accepting institution SCIM/IdP ownership evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "notification-webhook",
      label: "Notification webhook and signing configured",
      severity: "blocking",
      status: webhookProvider.configured && webhookProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${webhookProvider.mode}`,
        ...(webhookProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${webhookProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${webhookProvider.endpointHash ?? "none"}`,
        `secret=${webhookProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.notificationsPendingWebhook}`,
        `failed=${opsStatus.queues.notificationsFailedWebhook}`
      ],
      nextAction: webhookProvider.configured && webhookProvider.secretConfigured
        ? "Connect webhook delivery to the approved email/event workflow and alert on failed deliveries."
        : "Set SENA_NOTIFICATION_WEBHOOK_URL and SENA_NOTIFICATION_WEBHOOK_SECRET before relying on external notifications."
    }),
    readinessItem({
      id: "email-webhook",
      label: "Institution email webhook and signing configured",
      severity: "blocking",
      status: emailProvider.configured && emailProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${emailProvider.mode}`,
        ...(emailProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${emailProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${emailProvider.endpointHash ?? "none"}`,
        `secret=${emailProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.emailPendingWebhook}`,
        `failed=${opsStatus.queues.emailFailedWebhook}`
      ],
      nextAction: emailProvider.configured && emailProvider.secretConfigured
        ? "Connect signed password-reset and invitation email delivery to the institution email bridge."
        : "Set SENA_EMAIL_WEBHOOK_URL and SENA_EMAIL_WEBHOOK_SECRET before relying on password reset or invitation email."
    }),
    readinessItem({
      id: "audit-webhook",
      label: "Audit/SIEM webhook and signing configured",
      severity: "blocking",
      status: auditProvider.configured && auditProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${auditProvider.mode}`,
        ...(auditProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${auditProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${auditProvider.endpointHash ?? "none"}`,
        `secret=${auditProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.auditPendingWebhook}`,
        `failed=${opsStatus.queues.auditFailedWebhook}`
      ],
      nextAction: auditProvider.configured && auditProvider.secretConfigured
        ? "Connect signed audit forwarding to the institutional SIEM or logging workflow."
        : "Set SENA_AUDIT_WEBHOOK_URL and SENA_AUDIT_WEBHOOK_SECRET before relying on external audit forwarding."
    }),
    readinessFromGovernance(governance, "audit-log", "blocking", "Audit logging", "Enable audit logging before production."),
    readinessFromGovernance(governance, "rbac", "blocking", "RBAC roles and permissions", "Review role permissions before production.")
  ];

  const advisory: SenaEnterpriseDeploymentReadinessItem[] = [
    readinessItem({
      id: "node-env-production",
      label: "Runtime NODE_ENV production",
      severity: "advisory",
      status: opsStatus.deployment.nodeEnv === "production" ? "pass" : "review",
      evidence: [
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `nodeVersion=${opsStatus.deployment.nodeVersion}`,
        `runtime=${opsStatus.deployment.runtime}`
      ],
      nextAction: opsStatus.deployment.nodeEnv === "production"
        ? "Keep production runtime settings pinned in deployment configuration."
        : "Deploy with NODE_ENV=production for institution-facing traffic."
    }),
    readinessItem({
      id: "managed-database-decision",
      label: "Managed database or durable storage decision",
      severity: "advisory",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `storageEngine=${opsStatus.storage.engine}`,
        "current=file-backed-json",
        `databaseSyncWebhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `databaseSyncEndpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `databaseSyncSecret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        "bridge=sena-enterprise-database-sync-webhook/v1",
        "decision=managed-db-or-durable-volume-required-before-saas-scale"
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Document whether the signed sanitized-state bridge remains acceptable or replace it with a native managed database adapter before SaaS scale."
        : "Choose a managed database or durable volume strategy before multi-instance SaaS deployment."
    }),
    readinessItem({
      id: "object-storage-decision",
      label: "Managed object storage decision",
      severity: "advisory",
      status: objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "pass" : "review",
      evidence: [
        "uploadBlobStorage=private-local-directory",
        `objectStorageWebhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        "bridge=sena-enterprise-upload-object-storage-webhook/v1",
        "scanEngine=sena-local-upload-scan/v1",
        `uploads=${opsStatus.counts.uploads}`,
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Document whether the signed bridge remains acceptable or replace it with a native institution object-storage adapter before SaaS scale."
        : "Move upload blobs to institution-approved object storage and malware/DLP scanning before regulated deployment."
    }),
    readinessItem({
      id: "secret-hardening",
      label: "Security secret hardening",
      severity: "advisory",
      status: mfaKeySource() === "env-configured" && csrfKeySource() !== "local-default-review" && !passwordResetTokenExposure() ? "pass" : "review",
      evidence: [
        `mfaKeySource=${mfaKeySource()}`,
        `csrfKeySource=${csrfKeySource()}`,
        `passwordResetDelivery=${passwordResetTokenExposure() ? "local-token" : "email-provider-required"}`,
        `activePasswordResetRequests=${opsStatus.queues.activePasswordResetRequests}`,
        `activeAuthLockouts=${opsStatus.queues.activeAuthLockouts}`,
        `activeApiRateLimitBuckets=${opsStatus.queues.activeApiRateLimitBuckets}`
      ],
      nextAction: mfaKeySource() === "env-configured" && csrfKeySource() !== "local-default-review" && !passwordResetTokenExposure()
        ? "Keep auth secrets in the deployment secret store and rotate on schedule."
        : "Set SENA_MFA_ENCRYPTION_KEY plus SENA_CSRF_SECRET or SENA_SESSION_SECRET, and keep local reset-token exposure disabled."
    }),
    readinessFromGovernance(governance, "reliability-run-history", "advisory", "Reliability run history", "Run coding reliability workflow before publication claims."),
    readinessFromGovernance(governance, "validation-run-history", "advisory", "Validation run history", "Run validation workflow before publication claims."),
    readinessFromGovernance(governance, "domain-expert-review", "advisory", "Domain expert review", "Record domain expert review before publication claims."),
    readinessFromGovernance(governance, "deployment-monitoring", "advisory", "Deployment monitoring", "Connect deployment monitoring before handoff."),
    readinessFromGovernance(governance, "organization-deployment-package", "advisory", "Organization deployment package", "Generate redacted deployment evidence before platform handoff."),
    readinessFromGovernance(governance, "backup-restore-rehearsal", "advisory", "Backup restore rehearsal", "Run restore rehearsal before handoff.")
  ];

  const blockingPass = blocking.filter((item) => item.status === "pass").length;
  const blockingReview = blocking.length - blockingPass;
  const advisoryPass = advisory.filter((item) => item.status === "pass").length;
  const advisoryReview = advisory.length - advisoryPass;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDeploymentReadiness,
    status: blockingReview > 0 ? "blocked" : advisoryReview > 0 ? "review" : "ready",
    generatedAt: now(),
    environment: {
      nodeEnv: opsStatus.deployment.nodeEnv,
      runtime: "nodejs",
      storageEngine: opsStatus.storage.engine,
      configuredDirectory: opsStatus.storage.configuredDirectory,
      opsTokenConfigured: opsStatus.deployment.opsTokenConfigured,
      provisioningTokenConfigured: opsStatus.deployment.provisioningTokenConfigured,
      notificationWebhookConfigured: webhookProvider.configured,
      emailWebhookConfigured: emailProvider.configured,
      collaborationPubSubWebhookConfigured: collaborationProvider.configured,
      databaseSyncWebhookConfigured: databaseSyncProvider.configured,
      objectStorageWebhookConfigured: objectStorageProvider.configured,
      backupWebhookConfigured: backupProvider.configured,
      alertWebhookConfigured: alertProvider.configured,
      auditWebhookConfigured: auditProvider.configured,
      oidcProvidersConfigured: configuredOidcProviders
    },
    summary: {
      blockingPass,
      blockingReview,
      advisoryPass,
      advisoryReview,
      blockers: blocking.filter((item) => item.status === "review").map((item) => item.id)
    },
    blocking,
    advisory,
    runbook: {
      requiredBeforeProduction: blocking.map((item) => item.nextAction),
      platformDecisions: [
        "Choose managed database or durable volume ownership for enterprise JSON state, using the signed database sync bridge only when accepted by the platform owner.",
        "Connect signed collaboration pub/sub delivery to the selected external event bus and decide whether to replace the webhook bridge with a native bus adapter before SaaS scale.",
        "Connect signed team backup delivery to managed storage or the database bridge.",
        "Connect signed upload blob delivery to managed object storage, then decide whether to replace the bridge with a native adapter.",
        "Connect signed ops alert delivery to the deployment incident channel and alerting escalation policy.",
        "Finalize IdP tenant approval, redirect URI ownership, and secret rotation.",
        "Finalize institution email-provider credentials, delivery retention, and replay ownership.",
        "Connect audit/ops metrics to the deployment monitor and alerting policy.",
        "Document notification/email provider retention policy and operational owner."
      ],
      platformDecisionRegister: "sena-enterprise-platform-decision-register/v1",
      verificationCommands: [
        "npx tsc --noEmit",
        "npm test",
        "npm run build",
        "npm run sena:pilot:verify"
      ]
    }
  };
}

function governanceSecurityControl(
  governance: SenaEnterpriseGovernanceStatus,
  id: string,
  category: SenaEnterpriseSecurityControlCategory,
  severity: SenaEnterpriseDeploymentReadinessItem["severity"]
): SenaEnterpriseSecurityControl {
  const check = governanceCheck(governance, id);
  return {
    id,
    category,
    label: check?.label ?? id,
    severity,
    status: check?.status ?? "review",
    source: "governance",
    evidence: check?.evidence ?? ["governanceCheck=missing"],
    nextAction: check?.nextAction ?? "Add governance evidence for this security control."
  };
}

function readinessSecurityControl(
  readiness: SenaEnterpriseDeploymentReadiness,
  id: string,
  category: SenaEnterpriseSecurityControlCategory
): SenaEnterpriseSecurityControl {
  const item = [...readiness.blocking, ...readiness.advisory].find((candidate) => candidate.id === id);
  return {
    id,
    category,
    label: item?.label ?? id,
    severity: item?.severity ?? "advisory",
    status: item?.status ?? "review",
    source: "readiness",
    evidence: item?.evidence ?? ["readinessItem=missing"],
    nextAction: item?.nextAction ?? "Add deployment-readiness evidence for this security control."
  };
}

export function getEnterpriseSecurityPosture(): SenaEnterpriseSecurityPosture {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const governance = getEnterpriseGovernanceStatus();
  const readiness = getEnterpriseDeploymentReadiness();
  const selfManagedOidcControl: SenaEnterpriseSecurityControl = {
    id: "oauth-oidc-sso",
    category: "identity",
    label: "OAuth/OIDC provider configured and preflighted",
    severity: "blocking",
    status: "pass",
    source: "readiness",
    evidence: selfManagedIdentityEvidence(["authMode=local"]),
    nextAction: "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
  };
  const controls: SenaEnterpriseSecurityControl[] = [
    governanceSecurityControl(governance, "auth-session", "identity", "blocking"),
    selfManagedEnterprise ? selfManagedOidcControl : governanceSecurityControl(governance, "oauth-oidc-sso", "identity", "blocking"),
    governanceSecurityControl(governance, "security-response-headers", "data-protection", "blocking"),
    readinessSecurityControl(readiness, "oidc-provider", "identity"),
    readinessSecurityControl(readiness, "provisioning-token", "identity"),
    readinessSecurityControl(readiness, "identity-evidence-host-allowlist", "identity"),
    readinessSecurityControl(readiness, "identity-secret-version-binding", "identity"),
    readinessSecurityControl(readiness, "identity-secret-store-reference", "identity"),
    readinessSecurityControl(readiness, "identity-secret-rotation-cadence", "identity"),
    readinessSecurityControl(readiness, "identity-idp-tenant-binding", "identity"),
    readinessSecurityControl(readiness, "identity-lifecycle-owner-mode", "identity"),
    governanceSecurityControl(governance, "rbac", "access", "blocking"),
    governanceSecurityControl(governance, "team-lifecycle-governance", "access", "advisory"),
    readinessSecurityControl(readiness, "secret-hardening", "data-protection"),
    governanceSecurityControl(governance, "upload-security-scan", "data-protection", "blocking"),
    governanceSecurityControl(governance, "upload-storage-integrity", "data-protection", "blocking"),
    readinessSecurityControl(readiness, "object-storage-webhook", "data-protection"),
    governanceSecurityControl(governance, "audit-log", "audit-monitoring", "blocking"),
    readinessSecurityControl(readiness, "audit-webhook", "audit-monitoring"),
    readinessSecurityControl(readiness, "ops-bearer-token", "audit-monitoring"),
    readinessSecurityControl(readiness, "alert-webhook", "audit-monitoring"),
    readinessSecurityControl(readiness, "storage-writable", "continuity"),
    readinessSecurityControl(readiness, "write-before-backup", "continuity"),
    readinessSecurityControl(readiness, "backup-freshness", "continuity"),
    readinessSecurityControl(readiness, "backup-webhook", "continuity"),
    readinessSecurityControl(readiness, "database-sync-webhook", "continuity"),
    readinessSecurityControl(readiness, "collaboration-pubsub", "continuity")
  ];
  const pass = controls.filter((control) => control.status === "pass").length;
  const review = controls.length - pass;
  const blockingReview = controls.filter((control) => control.status === "review" && control.severity === "blocking").length;
  const advisoryReview = controls.filter((control) => control.status === "review" && control.severity === "advisory").length;
  const categories: SenaEnterpriseSecurityControlCategory[] = ["identity", "access", "data-protection", "audit-monitoring", "continuity"];
  const configuredOidcProviders = governance.auth.oidcProviders
    .filter((provider) => provider.configured)
    .map((provider) => provider.provider);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSecurityPosture,
    status: blockingReview > 0 ? "blocked" : review > 0 ? "review" : "ready",
    generatedAt: now(),
    evidenceSources: {
      governanceSchema: governance.schemaVersion,
      readinessSchema: readiness.schemaVersion
    },
    summary: {
      controls: controls.length,
      pass,
      review,
      blockingReview,
      advisoryReview,
      categories: categories.map((category) => {
        const categoryControls = controls.filter((control) => control.category === category);
        return {
          id: category,
          controls: categoryControls.length,
          review: categoryControls.filter((control) => control.status === "review").length
        };
      })
    },
    auth: {
      sessionCookie: governance.auth.sessionCookie,
      sessionDays: governance.auth.sessionDays,
      sessionPolicy: governance.auth.sessionPolicy,
      passwordHash: governance.auth.passwordHash,
      ssoModes: governance.auth.ssoModes,
      configuredOidcProviders,
      mfa: governance.auth.mfa,
      passwordReset: governance.auth.passwordReset
    },
    controls,
    runbook: {
      requiredBeforeProduction: controls
        .filter((control) => control.status === "review" && control.severity === "blocking")
        .map((control) => control.nextAction),
      reviewBeforePublication: controls
        .filter((control) => control.status === "review" && control.severity === "advisory")
        .map((control) => control.nextAction),
      api: "/api/sena/governance/security"
    }
  };
}

function platformDecisionCategory(decisionId: string): SenaEnterprisePlatformDecisionCategory {
  if (decisionId.includes("database") || decisionId.includes("storage")) return "storage";
  if (decisionId.includes("idp") || decisionId.includes("provisioning")) return "identity";
  if (decisionId.includes("collaboration")) return "collaboration";
  if (decisionId.includes("email")) return "delivery";
  if (decisionId.includes("alerting") || decisionId.includes("audit")) return "operations";
  return "saas";
}

function platformDecisionAcceptanceCriteria(decisionId: string): string[] {
  switch (decisionId) {
    case "native-managed-database":
      return [
        "Institution platform owner accepts the signed database-sync bridge for production or replaces it with a native managed database adapter.",
        "Durability, backup, restore, and multi-instance write ownership are documented."
      ];
    case "native-managed-object-storage":
      return [
        "Institution platform owner accepts the signed object-storage bridge for production or replaces it with a native object-storage adapter.",
        "Upload retention, malware/DLP review, and private object access are documented."
      ];
    case "native-collaboration-pubsub":
      return [
        "Institution platform owner accepts the signed pub/sub bridge for production or replaces it with a native event-bus adapter.",
        "Presence, comment, adjudication, and retry behavior are monitored across multi-instance runtime."
      ];
    case "institution-idp-approval":
      return [
        "Institution IdP tenant, redirect URI, callback origin, and secret rotation are approved.",
        "SSO preflight passes for every enabled provider before release."
      ];
    case "institution-provisioning-owner":
      return [
        "Institution provisioning owner is named for IdP, SCIM, and bearer-token rotation.",
        "Suspension and last-active-manager guardrails are accepted by the institution."
      ];
    case "deployment-alerting-escalation":
      return [
        "Alert owner, channel, runbook, and signed alert webhook delivery are approved.",
        "Critical readiness regressions are routed to the deployment incident policy."
      ];
    case "native-audit-siem-adapter":
      return [
        "Institution platform owner accepts the signed audit/SIEM bridge for production or replaces it with a native audit retention adapter.",
        "Audit retention, chain-head archival, SIEM delivery monitoring, and export ownership are documented."
      ];
    case "institution-email-provider":
      return [
        "Institution email provider accepts signed delivery payloads for invitations and password resets.",
        "Replay, retention, deliverability, and secure action URL handling are documented."
      ];
    case "native-managed-backup-storage":
      return [
        "Institution platform owner accepts the signed backup bridge for production or replaces it with a native managed backup and restore adapter.",
        "Backup retention, restore drill cadence, RPO/RTO ownership, and private storage access are documented."
      ];
    case "full-saas-backend-operations":
      return [
        "Managed database, object storage, pub/sub, email, alerting, audit, backup, and IdP ownership are approved for multi-instance SaaS operation.",
        "Local file-backed bridges are either formally accepted as interim production controls or replaced with native platform adapters."
      ];
    default:
      return ["Institution platform owner records an acceptance decision before regulated production use."];
  }
}

function platformDecisionProductionEvidenceIncludes(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  evidenceId: string
) {
  return Boolean(
    acceptance?.evidenceUrlHash &&
    acceptance.productionEvidenceIds?.includes(evidenceId) &&
    platformDecisionProductionEvidenceFresh(acceptance, evidenceId) &&
    identityPlatformEvidenceBindingStatus(acceptance) !== "stale" &&
    identityEvidenceUrlHostBindingCurrent(acceptance)
  );
}

function idpAcceptedProviderSecretsReady(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  const binding = acceptance?.technicalEvidenceBinding;
  return Boolean(
    binding?.decisionId === "institution-idp-approval" &&
    binding.provider === "institution" &&
    binding.secretBinding?.clientSecretStrength === "configured" &&
    binding.latestPreflightStatus === "pass" &&
    binding.configBinding === "current"
  );
}

function idpAcceptedSecretStoreReferenceReady(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return secretStoreReferenceReady(acceptance?.technicalEvidenceBinding?.secretStoreReferenceBinding);
}

function idpAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return {
    tenant: platformDecisionProductionEvidenceIncludes(acceptance, "idp-tenant-approval"),
    callback: platformDecisionProductionEvidenceIncludes(acceptance, "idp-callback-approval"),
    providerSecrets: platformDecisionProductionEvidenceIncludes(acceptance, "sso-provider-secrets") && idpAcceptedProviderSecretsReady(acceptance),
    secretStoreReference: platformDecisionProductionEvidenceIncludes(acceptance, "sso-secret-store-reference") && idpAcceptedSecretStoreReferenceReady(acceptance),
    secretRotation: platformDecisionProductionEvidenceIncludes(acceptance, "sso-secret-rotation"),
    evidenceUrl: Boolean(acceptance?.evidenceUrlHash)
  };
}

function provisioningOwnerAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return {
    owner: platformDecisionProductionEvidenceIncludes(acceptance, "provisioning-owner"),
    scimOrIdp: platformDecisionProductionEvidenceIncludes(acceptance, "scim-or-idp-ownership"),
    bearerTokenRotation: platformDecisionProductionEvidenceIncludes(acceptance, "bearer-token-rotation"),
    lifecycleGuardrails: platformDecisionProductionEvidenceIncludes(acceptance, "lifecycle-guardrails"),
    evidenceUrl: Boolean(acceptance?.evidenceUrlHash)
  };
}

function platformDecisionChecklistEvidence(entries: string[]) {
  return entries
    .filter((entry) => !/(^|[;|])(secret|password)=[^;|]+/i.test(entry) && !/CLIENT_SECRET/.test(entry))
    .map((entry) => entry.replace(/(^|[;|])token=[^;|]+/gi, "$1token=redacted"));
}

function platformDecisionEvidenceChecklistItem(input: {
  id: string;
  label: string;
  status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
  productionRequired: boolean;
  source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
  evidence: string[];
  nextAction: string;
}): SenaEnterprisePlatformDecisionEvidenceChecklistItem {
  return {
    ...input,
    evidence: platformDecisionChecklistEvidence(input.evidence)
  };
}

function acceptedPlatformChecklistStatus(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  present: boolean
): SenaEnterprisePlatformDecisionEvidenceChecklistStatus {
  return acceptance?.status === "accepted" && acceptance.acceptedBridge && present ? "accepted" : "missing";
}

function presentPlatformChecklistStatus(present: boolean): SenaEnterprisePlatformDecisionEvidenceChecklistStatus {
  return present ? "present" : "missing";
}

function platformDecisionEvidenceChecklist(
  decision: SenaEnterpriseOrganizationDeploymentDecision,
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  productionBlocking: boolean,
  acceptedBridge: boolean,
  acceptanceCriteria: string[]
): SenaEnterprisePlatformDecisionEvidenceChecklistItem[] {
  if (decision.id === "institution-idp-approval") {
    const evidence = idpAcceptanceEvidence(acceptance);
    const tenantBinding = idpTenantBinding();
    const tenantBindingReady = idpTenantBindingReady(tenantBinding);
    const ssoSecretStoreReference = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
    const ssoSecretStoreReferenceReady = secretStoreReferenceReady(ssoSecretStoreReference);
    const rotationCadence = identitySecretRotationCadenceBinding();
    const rotationCadenceReady = identitySecretRotationCadenceReady(rotationCadence);
    const providerSecretsConfigured = decision.evidence.some((entry) =>
      (/^institution:configured=true(;|$)/.test(entry) || /^institution=oauth-oidc;missing=none(?:;|$)/.test(entry)) &&
      /clientSecretStrength=configured/.test(entry) &&
      /endpointHostPolicy=production/.test(entry)
    );
    const preflightPassed = decision.evidence.some((entry) =>
      /^institution:configured=true;preflight=pass(;|$)/.test(entry) ||
      /^preflightPassedProviders=(?:.*\|)?institution(?:\||$)/.test(entry)
    );
    return selfManagedIdentityChecklistItems([
      platformDecisionEvidenceChecklistItem({
        id: "idp-tenant-approval",
        label: "Institution IdP tenant approval",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.tenant && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record institution IdP tenant approval with owner evidence URL."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "idp-callback-approval",
        label: "Provider callback and redirect URI approval",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.callback && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `callbackEvidence=${evidence.callback}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Attach provider-side callback or redirect URI approval evidence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-secret-rotation",
        label: "SSO client secret rotation ownership",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.secretRotation && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `secretRotationEvidence=${evidence.secretRotation}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Document the institution-owned SSO secret rotation path before production."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "idp-tenant-binding",
        label: "Runtime IdP tenant identifier binding",
        status: presentPlatformChecklistStatus(tenantBindingReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `tenantBinding=${tenantBinding.configured ? "configured" : "missing"}`,
          `requiredInProduction=${tenantBinding.requiredInProduction}`,
          `tenantHash=${tenantBinding.tenantHash ? "present" : "missing"}`,
          `env=${tenantBinding.env}`
        ],
        nextAction: "Set SENA_SSO_INSTITUTION_TENANT_ID so tenant approval evidence is bound to the institution IdP tenant or app registration."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-secret-rotation-cadence",
        label: "Identity secret rotation cadence configured",
        status: presentPlatformChecklistStatus(rotationCadenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `cadenceDays=${rotationCadence.cadenceDays ?? "missing"}`,
          `valid=${rotationCadence.valid}`,
          `requiredInProduction=${rotationCadence.requiredInProduction}`,
          `minDays=${rotationCadence.minDays}`,
          `maxDays=${rotationCadence.maxDays}`,
          `cadenceHash=${rotationCadence.cadenceHash ? "present" : "missing"}`,
          `env=${rotationCadence.env}`
        ],
        nextAction: "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to the institution-approved SSO/provisioning secret rotation cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-secret-store-reference",
        label: "SSO client secret store reference",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.secretStoreReference && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: [
          ...(acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `secretStoreReferenceEvidence=${evidence.secretStoreReference}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"]),
          `secretStoreReference=${ssoSecretStoreReference.configured ? "configured" : "missing"}`,
          `requiredInProduction=${ssoSecretStoreReference.requiredInProduction}`,
          `referenceHash=${ssoSecretStoreReference.referenceHash ? "present" : "missing"}`,
          `env=${ssoSecretStoreReference.env}`,
          "secretValues=excluded"
        ],
        nextAction: "Record institution secret-store custody evidence for SENA_SSO_INSTITUTION_CLIENT_SECRET_REF before production."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-provider-secrets",
        label: "SSO provider secrets configured",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.providerSecrets && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: [
          ...(acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `providerSecretsEvidence=${evidence.providerSecrets}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"]),
          ...decision.evidence.filter((entry) =>
            /^institution=/.test(entry) ||
            /^institution:configured=/.test(entry)
          )
        ],
        nextAction: "Record institution-owned SSO provider secret custody evidence without exposing secret values."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-preflight",
        label: "SSO provider preflight passed",
        status: presentPlatformChecklistStatus(preflightPassed),
        productionRequired: true,
        source: "technical-readiness",
        evidence: decision.evidence.filter((entry) =>
          /^institution:.*preflight=/.test(entry) ||
          /^preflightPassedProviders=(?:.*\|)?institution(?:\||$)/.test(entry)
        ),
        nextAction: "Run SSO preflight against every enabled provider before release."
      })
    ]);
  }

  if (decision.id === "institution-provisioning-owner") {
    const evidence = provisioningOwnerAcceptanceEvidence(acceptance);
    const rotationCadence = identitySecretRotationCadenceBinding();
    const rotationCadenceReady = identitySecretRotationCadenceReady(rotationCadence);
    const lifecycleOwnerMode = identityLifecycleOwnerModeBinding();
    const lifecycleOwnerModeReady = identityLifecycleOwnerModeReady(lifecycleOwnerMode);
    const provisioningSecretStoreReference = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
    const provisioningSecretStoreReferenceReady = secretStoreReferenceReady(provisioningSecretStoreReference);
    const provisioningTokenConfigured = decision.evidence.some((entry) =>
      /provisioningToken=configured/.test(entry) || /token=configured/.test(entry)
    );
    const provisioningTokenProductionReady = provisioningTokenConfigured && decision.evidence.some((entry) =>
      entry === "provisioningTokenStrength=configured"
    );
    return selfManagedIdentityChecklistItems([
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-owner",
        label: "Institution provisioning owner named",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.owner && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `ownerEvidence=${evidence.owner}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record the institution owner for provisioning lifecycle operations."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "scim-or-idp-ownership",
        label: "SCIM or IdP lifecycle ownership",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.scimOrIdp && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `scimOrIdpEvidence=${evidence.scimOrIdp}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Document whether lifecycle ownership sits with SCIM or the institution IdP."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "bearer-token-rotation",
        label: "Provisioning bearer-token rotation",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.bearerTokenRotation && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `bearerTokenRotationEvidence=${evidence.bearerTokenRotation}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Attach the institution-approved bearer-token rotation owner and cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "lifecycle-guardrails",
        label: "Suspension and last-active-manager guardrails",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.lifecycleGuardrails && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `lifecycleGuardrailEvidence=${evidence.lifecycleGuardrails}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record acceptance of suspension behavior and last-active-manager protection."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-token",
        label: "Provisioning token configured",
        status: presentPlatformChecklistStatus(provisioningTokenProductionReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: decision.evidence.filter((entry) =>
          /^provisioningToken=/.test(entry) ||
          /^token=/.test(entry) ||
          /^provisioningTokenStrength=/.test(entry) ||
          /^provisioningTokenMinLength=/.test(entry)
        ),
        nextAction: "Configure the provisioning bearer token through the secret store."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-secret-rotation-cadence",
        label: "Identity secret rotation cadence configured",
        status: presentPlatformChecklistStatus(rotationCadenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `cadenceDays=${rotationCadence.cadenceDays ?? "missing"}`,
          `valid=${rotationCadence.valid}`,
          `requiredInProduction=${rotationCadence.requiredInProduction}`,
          `minDays=${rotationCadence.minDays}`,
          `maxDays=${rotationCadence.maxDays}`,
          `cadenceHash=${rotationCadence.cadenceHash ? "present" : "missing"}`,
          `env=${rotationCadence.env}`
        ],
        nextAction: "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to the institution-approved SSO/provisioning secret rotation cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-secret-store-reference",
        label: "Provisioning token secret store reference",
        status: presentPlatformChecklistStatus(provisioningSecretStoreReferenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `secretStoreReference=${provisioningSecretStoreReference.configured ? "configured" : "missing"}`,
          `requiredInProduction=${provisioningSecretStoreReference.requiredInProduction}`,
          `referenceHash=${provisioningSecretStoreReference.referenceHash ? "present" : "missing"}`,
          `env=${provisioningSecretStoreReference.env}`,
          "secretValues=excluded"
        ],
        nextAction: "Set SENA_PROVISIONING_TOKEN_SECRET_REF to the institution secret-store reference for the provisioning bearer token."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-lifecycle-owner-mode",
        label: "SCIM or IdP lifecycle owner mode configured",
        status: presentPlatformChecklistStatus(lifecycleOwnerModeReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `mode=${lifecycleOwnerMode.mode ?? "missing"}`,
          `valid=${lifecycleOwnerMode.valid}`,
          `requiredInProduction=${lifecycleOwnerMode.requiredInProduction}`,
          `acceptedModes=${lifecycleOwnerMode.acceptedModes.join("|")}`,
          `env=${lifecycleOwnerMode.env}`
        ],
        nextAction: "Set SENA_IDENTITY_LIFECYCLE_OWNER_MODE to scim, idp, or hybrid so institution lifecycle ownership is explicit."
      })
    ]);
  }

  return acceptanceCriteria.map((criteria, index) => platformDecisionEvidenceChecklistItem({
    id: `${decision.id}-criterion-${index + 1}`,
    label: criteria,
    status: acceptedBridge ? "accepted" : decision.status === "open" ? "missing" : "present",
    productionRequired: productionBlocking,
    source: acceptedBridge ? "platform-acceptance" : "technical-readiness",
    evidence: acceptedBridge ? [`acceptedBridge=${acceptedBridge}`] : decision.evidence,
    nextAction: decision.nextAction
  }));
}

function missingPlatformDecisionProductionEvidence(decision: SenaEnterprisePlatformDecisionRegisterDecision) {
  return decision.evidenceChecklist.filter((item) => item.productionRequired && item.status === "missing");
}

function platformDecisionProductionBlocking(decisionId: string): boolean {
  if (isSelfManagedIdentityDecision(decisionId)) return false;
  if (isSelfManagedLocalPlatformDecision(decisionId)) return false;
  return [
    "native-managed-database",
    "native-managed-object-storage",
    "native-collaboration-pubsub",
    "institution-idp-approval",
    "institution-provisioning-owner",
    "deployment-alerting-escalation",
    "native-audit-siem-adapter",
    "institution-email-provider",
    "native-managed-backup-storage",
    "full-saas-backend-operations"
  ].includes(decisionId);
}

function platformDecisionOwnerEvidence(decision: SenaEnterpriseOrganizationDeploymentDecision): string[] {
  const ownerEvidence = decision.evidence.filter((entry) =>
    /owner|provider|tenant|callback|channel|runbook|configured|endpointHash|approval|approved|bridge/i.test(entry)
  );
  return ownerEvidence.length > 0 ? ownerEvidence : [`status=${decision.status}`];
}

function latestPlatformDecisionAcceptances(
  acceptances: SenaEnterprisePlatformDecisionAcceptance[]
) {
  const latest = new Map<string, SenaEnterprisePlatformDecisionAcceptance>();
  for (const acceptance of [...acceptances].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    if (!latest.has(acceptance.decisionId)) {
      latest.set(acceptance.decisionId, acceptance);
    }
  }
  return latest;
}

function platformDecisionAcceptedBridge(decision: SenaEnterpriseOrganizationDeploymentDecision): boolean {
  if (isSelfManagedIdentityDecision(decision.id)) return true;
  if (isSelfManagedLocalPlatformDecision(decision.id)) return true;
  return decision.evidence.some((entry) =>
    entry === "bridgeAcceptance=accepted" || entry === "platformAcceptance=accepted"
  );
}

function buildEnterprisePlatformDecisionRegister(
  decisions: SenaEnterpriseOrganizationDeploymentDecision[],
  acceptances: SenaEnterprisePlatformDecisionAcceptance[] = []
): SenaEnterprisePlatformDecisionRegister {
  const latestAcceptances = latestPlatformDecisionAcceptances(acceptances);
  const registerDecisions = decisions.map((decision): SenaEnterprisePlatformDecisionRegisterDecision => {
    const acceptance = latestAcceptances.get(decision.id);
    const acceptedBridge = platformDecisionAcceptedBridge(decision) ||
      (acceptance?.status === "accepted" && acceptance.acceptedBridge);
    const ownerEvidence = platformDecisionOwnerEvidence(decision);
    const productionBlocking = platformDecisionProductionBlocking(decision.id);
    const acceptanceCriteria = platformDecisionAcceptanceCriteria(decision.id);
    if (acceptance) {
      ownerEvidence.push(
        `acceptance=${acceptance.schemaVersion}`,
        `acceptanceStatus=${acceptance.status}`,
        `acceptedBridge=${acceptedBridge}`,
        `ownerRole=${acceptance.ownerRole}`,
        `environment=${acceptance.environment}`,
        `updatedAt=${acceptance.updatedAt}`
      );
      if (acceptance.evidenceUrlHash) {
        ownerEvidence.push(`evidenceUrlHash=${acceptance.evidenceUrlHash}`);
      }
      const productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance) ?? acceptance.productionEvidenceReceipt;
      if (productionEvidenceReceipt) {
        ownerEvidence.push(
          `productionEvidenceIds=${productionEvidenceReceipt.submittedEvidenceIds.join("|") || "none"}`,
          `missingProductionEvidenceIds=${productionEvidenceReceipt.missingEvidenceIds.join("|") || "none"}`
        );
      }
    }
    if (isSelfManagedLocalPlatformDecision(decision.id)) {
      ownerEvidence.push(
        "enterpriseDeploymentMode=self-managed",
        "selfManagedBridge=accepted-local-runtime",
        "institutionPlatformEvidence=not-applicable"
      );
    }
    return {
      ...decision,
      category: platformDecisionCategory(decision.id),
      productionBlocking,
      acceptedBridge,
      ownerEvidence,
      acceptanceCriteria,
      evidenceChecklist: platformDecisionEvidenceChecklist(decision, acceptance, productionBlocking, acceptedBridge, acceptanceCriteria)
    };
  });
  const unresolvedActions = registerDecisions
    .flatMap((decision) => {
      const acceptance = latestAcceptances.get(decision.id);
      const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
      const decisionNeedsResolution = decision.status === "open" ||
        (decision.productionBlocking && !decision.acceptedBridge) ||
        missingProductionEvidence.length > 0 ||
        acceptance?.status === "rejected" ||
        acceptance?.status === "needs-native-adapter";
      if (!decisionNeedsResolution) return [];
      return missingProductionEvidence.length > 0
        ? missingProductionEvidence.map((item) => item.nextAction)
        : [decision.nextAction];
    });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister,
    generatedAt: now(),
    summary: {
      decisions: registerDecisions.length,
      ready: registerDecisions.filter((decision) => decision.status === "ready").length,
      bridgeReady: registerDecisions.filter((decision) => decision.status === "bridge-ready").length,
      open: registerDecisions.filter((decision) => decision.status === "open").length,
      productionBlocking: registerDecisions
        .filter((decision) => {
          const acceptance = latestAcceptances.get(decision.id);
          const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
          return decision.productionBlocking && (
            decision.status === "open" ||
            !decision.acceptedBridge ||
            missingProductionEvidence.length > 0 ||
            acceptance?.status === "rejected" ||
            acceptance?.status === "needs-native-adapter"
          );
        })
        .length,
      acceptedBridge: registerDecisions.filter((decision) => decision.acceptedBridge).length,
      acceptedBridgeMissingEvidence: registerDecisions.filter((decision) =>
        decision.acceptedBridge && missingPlatformDecisionProductionEvidence(decision).length > 0
      ).length
    },
    decisions: registerDecisions,
    nextActions: Array.from(new Set(unresolvedActions))
  };
}

export function getEnterprisePlatformDecisionRegister(input: { teamId?: string } = {}): SenaEnterprisePlatformDecisionRegister {
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  return buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances);
}

function nativeAdapterSpec(decisionId: string) {
  switch (decisionId) {
    case "native-managed-database":
      return {
        id: "managed-database-adapter",
        currentAdapter: "file-backed-json",
        targetAdapter: "managed-database",
        bridgeSchema: "sena-enterprise-database-sync-webhook/v1"
      };
    case "native-managed-object-storage":
      return {
        id: "managed-object-storage-adapter",
        currentAdapter: "private-local-upload-directory",
        targetAdapter: "managed-object-storage",
        bridgeSchema: "sena-enterprise-upload-object-storage-webhook/v1"
      };
    case "native-collaboration-pubsub":
      return {
        id: "managed-collaboration-pubsub-adapter",
        currentAdapter: "single-runtime-sse-plus-webhook-queue",
        targetAdapter: "managed-event-bus",
        bridgeSchema: "sena-enterprise-collaboration-pubsub-webhook/v1"
      };
    case "institution-idp-approval":
      return {
        id: "institution-idp-adapter",
        currentAdapter: "oauth-oidc-or-local-pilot-fallback",
        targetAdapter: "institution-idp-tenant",
        bridgeSchema: "sena-enterprise-sso-preflight/v1"
      };
    case "institution-provisioning-owner":
      return {
        id: "institution-provisioning-adapter",
        currentAdapter: "service-token-provisioning-plus-scim-bridge",
        targetAdapter: "institution-idp-scim-owner",
        bridgeSchema: "sena-scim-provisioning-bridge/v1"
      };
    case "deployment-alerting-escalation":
      return {
        id: "deployment-alerting-adapter",
        currentAdapter: "signed-alert-webhook",
        targetAdapter: "institution-incident-escalation",
        bridgeSchema: "sena-enterprise-ops-alert-webhook/v1"
      };
    case "native-audit-siem-adapter":
      return {
        id: "institution-audit-siem-adapter",
        currentAdapter: "append-only-file-audit-log-plus-signed-webhook",
        targetAdapter: "institution-siem-audit-retention",
        bridgeSchema: "sena-enterprise-audit-webhook/v1"
      };
    case "institution-email-provider":
      return {
        id: "institution-email-adapter",
        currentAdapter: "signed-email-webhook",
        targetAdapter: "institution-email-provider",
        bridgeSchema: "sena-enterprise-email-webhook/v1"
      };
    case "native-managed-backup-storage":
      return {
        id: "managed-backup-storage-adapter",
        currentAdapter: "team-scoped-file-backup-plus-signed-webhook",
        targetAdapter: "managed-backup-storage-and-restore",
        bridgeSchema: "sena-enterprise-backup-webhook/v1"
      };
    case "full-saas-backend-operations":
      return {
        id: "full-saas-operations-adapter",
        currentAdapter: "file-backed-runtime-plus-signed-bridges",
        targetAdapter: "managed-saas-operations-backend",
        bridgeSchema: "sena-enterprise-organization-deployment/v1"
      };
    default:
      return {
        id: `${decisionId}-adapter`,
        currentAdapter: "local-enterprise-runtime",
        targetAdapter: "institution-managed-adapter",
        bridgeSchema: "sena-enterprise-platform-decision-acceptance/v1"
      };
  }
}

function nativeAdapterCertificationStatus(
  decision: SenaEnterprisePlatformDecisionRegisterDecision,
  acceptance?: SenaEnterprisePlatformDecisionAcceptance
): SenaEnterpriseNativeAdapterCertificationStatus {
  if (acceptance?.status === "needs-native-adapter") return "native-required";
  if (acceptance?.status === "rejected") return "blocked";
  if (acceptance?.status === "superseded") return "superseded";
  if (decision.acceptedBridge) return "accepted-bridge";
  if (decision.status === "bridge-ready") return "bridge-ready";
  if (decision.status === "ready") return "native-ready";
  return "open";
}

function nativeAdapterCertificationEvidence(
  decision: SenaEnterprisePlatformDecisionRegisterDecision,
  spec: ReturnType<typeof nativeAdapterSpec>
) {
  const hasEndpoint = decision.evidence.some((entry) => /^endpointHash=(?!none$)/.test(entry));
  return Array.from(new Set([
    `platformDecision=${decision.id}`,
    `category=${decision.category}`,
    `currentAdapter=${spec.currentAdapter}`,
    `targetAdapter=${spec.targetAdapter}`,
    `bridge=${spec.bridgeSchema}`,
    `decisionStatus=${decision.status}`,
    `acceptedBridge=${decision.acceptedBridge}`,
    `endpointHash=${hasEndpoint ? "present" : "missing"}`,
    ...decision.evidence.filter((entry) => !/secret|token|password/i.test(entry))
  ]));
}

function buildEnterpriseNativeAdapterCertification(
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister,
  acceptances: SenaEnterprisePlatformDecisionAcceptance[] = []
): SenaEnterpriseNativeAdapterCertification {
  const latestAcceptances = latestPlatformDecisionAcceptances(acceptances);
  const adapters = platformDecisionRegister.decisions.map((decision) => {
    const spec = nativeAdapterSpec(decision.id);
    const acceptance = latestAcceptances.get(decision.id);
    const status = nativeAdapterCertificationStatus(decision, acceptance);
    const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
    const productionBlocking = decision.productionBlocking && (
      missingProductionEvidence.length > 0 ||
      (!decision.acceptedBridge && (
        status === "open" ||
        status === "bridge-ready" ||
        status === "native-ready" ||
        status === "native-required" ||
        status === "blocked"
      ))
    );
    return {
      id: spec.id,
      decisionId: decision.id,
      category: decision.category,
      label: decision.label,
      status,
      currentAdapter: spec.currentAdapter,
      targetAdapter: spec.targetAdapter,
      bridgeSchema: spec.bridgeSchema,
      acceptedBridge: decision.acceptedBridge,
      productionBlocking,
      certificationEvidence: nativeAdapterCertificationEvidence(decision, spec),
      ownerEvidence: decision.ownerEvidence,
      acceptanceCriteria: decision.acceptanceCriteria,
      nextAction: decision.nextAction
    };
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification,
    generatedAt: now(),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    summary: {
      adapters: adapters.length,
      nativeReady: adapters.filter((adapter) => adapter.status === "native-ready").length,
      acceptedBridge: adapters.filter((adapter) => adapter.status === "accepted-bridge").length,
      bridgeReady: adapters.filter((adapter) => adapter.status === "bridge-ready").length,
      nativeRequired: adapters.filter((adapter) => adapter.status === "native-required").length,
      productionBlocking: adapters.filter((adapter) => adapter.productionBlocking).length
    },
    export: {
      api: "/api/sena/ops/native-adapters",
      filename: "sena-enterprise-native-adapter-certification.json"
    },
    adapters,
    nextActions: Array.from(new Set(adapters
      .filter((adapter) => adapter.productionBlocking || adapter.status === "native-required")
      .map((adapter) => adapter.nextAction)))
  };
}

export function getEnterpriseNativeAdapterCertification(input: { teamId?: string } = {}): SenaEnterpriseNativeAdapterCertification {
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const platformDecisionRegister = input.teamId
    ? buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances)
    : deployment.platformDecisionRegister;
  return buildEnterpriseNativeAdapterCertification(platformDecisionRegister, platformDecisionAcceptances);
}

function buildEnterpriseSaasOperationsReadiness(input: {
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  nativeAdapterCertification: SenaEnterpriseNativeAdapterCertification;
  releaseGate: ReturnType<typeof buildEnterpriseDeploymentReleaseGateEvidence>;
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  saasOperatingModelApproved: boolean;
}): SenaEnterpriseSaasOperationsReadiness {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const fullSaasDecision = input.platformDecisionRegister.decisions.find((decision) => decision.id === "full-saas-backend-operations");
  const latestReleaseGate = input.releaseGate.latestReview;
  const fullSaasDecisionAccepted = selfManagedEnterprise || Boolean(fullSaasDecision?.acceptedBridge);
  const latestReleaseGateApproved = selfManagedEnterprise || latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = selfManagedEnterprise || latestReleaseGate?.verificationEvidence?.status === "passed";
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = selfManagedEnterprise || latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const identityProductionReleaseGateDigestBinding = selfManagedEnterprise
    ? "not-required"
    : !latestReleaseGateIdentitySnapshot?.evidenceBindingDigest || !input.identityProductionHandoff.evidenceBindingDigest
    ? "missing"
    : latestReleaseGateIdentitySnapshot.evidenceBindingDigest === input.identityProductionHandoff.evidenceBindingDigest
      ? "current"
      : "stale";
  const nativeAdapterProductionBlocking = input.nativeAdapterCertification.summary.productionBlocking;
  const blockers = selfManagedEnterprise ? [] : [
    input.saasOperatingModelApproved ? null : "saas-operating-model-approval-env-required",
    fullSaasDecisionAccepted ? null : "full-saas-platform-decision-acceptance-required",
    nativeAdapterProductionBlocking === 0 ? null : "native-adapter-certification-production-blockers",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker));
  const nextActions = selfManagedEnterprise ? [
    "Keep self-managed local enterprise runtime evidence, backups, audit integrity, and release verification current."
  ] : [
    input.saasOperatingModelApproved ? null : "Set SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED=1 only after institution platform-owner approval is recorded.",
    fullSaasDecisionAccepted ? null : "Record an accepted full-saas-backend-operations platform decision with owner evidence.",
    nativeAdapterProductionBlocking === 0 ? null : "Resolve or explicitly accept every production-blocking native adapter certification item.",
    latestReleaseGateApproved && latestReleaseGateVerificationPassed ? null : "Record an approved release gate with passed verification evidence before institution production rollout.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before SaaS operations readiness is marked ready.",
    identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes."
  ].filter((action): action is string => Boolean(action));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness,
    generatedAt: now(),
    status: blockers.length === 0 ? "ready" : blockers.some((blocker) =>
      blocker.includes("required") ||
      blocker.includes("blockers") ||
      blocker === "release-gate-identity-production-evidence-digest-stale"
    ) ? "blocked" : "review",
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/saas-operations",
      filename: "sena-enterprise-saas-operations-readiness.json"
    },
    approval: {
      envConfigured: selfManagedEnterprise || input.saasOperatingModelApproved,
      fullSaasDecisionAccepted,
      latestReleaseGateStatus: latestReleaseGate?.decision,
      latestReleaseGateVerificationStatus: latestReleaseGate?.verificationEvidence?.status
    },
    summary: {
      platformDecisions: input.platformDecisionRegister.summary.decisions,
      acceptedPlatformDecisions: input.platformDecisionRegister.decisions.filter((decision) => decision.ownerEvidence.some((entry) => entry === "acceptance=sena-enterprise-platform-decision-acceptance/v1")).length,
      acceptedBridge: input.platformDecisionRegister.summary.acceptedBridge,
      nativeAdapterProductionBlocking,
      releaseGateReviews: input.releaseGate.summary.total,
      identityProductionStatus: latestReleaseGateIdentitySnapshot?.status ?? "missing",
      identitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing",
      identityRotationFreshness: latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing",
      identityCutoverChecklist: latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing",
      identityCutoverBlockers: latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing",
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-platform-decision-acceptance/v1",
      "sena-enterprise-platform-decision-register/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
    ],
    evidence: [
      ...(selfManagedEnterprise ? [
        "enterpriseDeploymentMode=self-managed",
        "fullSaasOperatingModel=not-applicable",
        "selfManagedRuntime=local-enterprise"
      ] : []),
      `saasOperatingModelApproved=${input.saasOperatingModelApproved ? "yes" : "no"}`,
      `fullSaasDecisionAccepted=${fullSaasDecisionAccepted ? "yes" : "no"}`,
      `nativeAdapterCertification=${input.nativeAdapterCertification.schemaVersion}`,
      `nativeAdapterProductionBlocking=${nativeAdapterProductionBlocking}`,
      `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
      `acceptedBridge=${input.platformDecisionRegister.summary.acceptedBridge}`,
      `releaseGateReviews=${input.releaseGate.summary.total}`,
      `latestReleaseGate=${latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${latestReleaseGate?.verificationEvidence?.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `latestReleaseGateIdentityEvidenceBindingDigest=${latestReleaseGateIdentitySnapshot?.evidenceBindingDigest ?? "missing"}`,
      `currentIdentityProductionEvidenceBindingDigest=${input.identityProductionHandoff.evidenceBindingDigest ?? "missing"}`,
      `identityProductionReleaseGateDigestBinding=${identityProductionReleaseGateDigestBinding}`
    ],
    nextActions
  };
}

export function getEnterpriseSaasOperationsReadiness(input: { teamId?: string } = {}): SenaEnterpriseSaasOperationsReadiness {
  if (!input.teamId) {
    return getEnterpriseOrganizationDeploymentPackage().saasOperationsReadiness;
  }
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = (db.platformDecisionAcceptances ?? [])
    .filter((acceptance) => acceptance.teamId === input.teamId);
  const platformDecisionRegister = buildEnterprisePlatformDecisionRegister(
    deployment.platformDecisions,
    platformDecisionAcceptances
  );
  const nativeAdapterCertification = buildEnterpriseNativeAdapterCertification(
    platformDecisionRegister,
    platformDecisionAcceptances
  );
  const releaseGate = buildEnterpriseDeploymentReleaseGateEvidence(
    (db.releaseGateReviews ?? []).filter((review) => review.teamId === input.teamId)
  );
  const identityProductionHandoff = buildEnterpriseIdentityProductionEvidenceDossier({
    teamId: input.teamId,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  return buildEnterpriseSaasOperationsReadiness({
    platformDecisionRegister,
    nativeAdapterCertification,
    releaseGate,
    identityProductionHandoff,
    saasOperatingModelApproved: envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED") === "1"
  });
}

function buildEnterpriseReleaseGateDraft(input: {
  generatedAt: string;
  status: SenaEnterpriseGoLiveRehearsal["status"];
  blockers: string[];
  verificationCommands: string[];
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
}): SenaEnterpriseReleaseGateDraft {
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const decision: SenaEnterpriseReleaseGateDecision = input.status === "ready"
    ? "approved"
    : input.status === "review"
      ? "conditional"
      : "blocked";
  const verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"] = input.status === "ready" && input.latestReleaseGate?.verificationEvidence.status === "passed"
    ? "passed"
    : "not-run";
  const blockerSummary = input.blockers.length > 0 ? input.blockers.join(", ") : "none";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft,
    generatedAt: input.generatedAt,
    decision,
    environment: input.latestReleaseGate?.environment ?? "pilot-production",
    releaseVersion: input.latestReleaseGate?.releaseVersion ?? `${input.generatedAt.slice(0, 10)}-go-live-rehearsal`,
    verificationCommand,
    verificationEvidence: {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence,
      command: verificationCommand,
      status: verificationStatus,
      summary: `Generated from sena-enterprise-go-live-rehearsal/v1. Rehearsal status=${input.status}; blockers=${blockerSummary}. Run ${verificationCommand} and paste the real verification output summary before approving production release.`
    },
    notes: `Go-live rehearsal draft generated from current ops evidence. Suggested decision=${decision}. Blockers=${blockerSummary}.`,
    requiredBeforeSubmit: [
      "Run npm run sena:pilot:verify and paste the real verification summary before approving production release.",
      input.blockers.length > 0
        ? "Resolve go-live rehearsal blockers before changing the draft decision to approved."
        : "Attach the latest verifier output or keep the decision conditional until verification evidence is reviewed."
    ],
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateReview=sena-enterprise-release-gate-review/v1",
      "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
      `suggestedDecision=${decision}`,
      `verificationStatus=${verificationStatus}`,
      `blockers=${input.blockers.length}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot)
    ]
  };
}

function buildEnterpriseGoLiveRollbackDrill(input: {
  generatedAt: string;
  goLiveStatus: SenaEnterpriseGoLiveRehearsal["status"];
  goLiveBlockers: string[];
  readiness: SenaEnterpriseDeploymentReadiness;
  governance: SenaEnterpriseGovernanceStatus;
  verificationCommands: string[];
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
  identityProductionReleaseGateDigestBinding: "current" | "stale" | "missing";
}): SenaEnterpriseGoLiveRollbackDrill {
  const readinessItems = [...input.readiness.blocking, ...input.readiness.advisory];
  const readinessItem = (id: string) => readinessItems.find((item) => item.id === id);
  const governanceCheck = (id: string) => input.governance.checks.find((check) => check.id === id);
  const backupFreshness = readinessItem("backup-freshness");
  const backupWebhook = readinessItem("backup-webhook");
  const alertWebhook = readinessItem("alert-webhook");
  const restoreRehearsal = governanceCheck("backup-restore-rehearsal");
  const deploymentMonitoring = governanceCheck("deployment-monitoring");
  const releaseGateReview = governanceCheck("release-gate-review");
  const latestReleaseGateApproved = input.latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = input.latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const backupReady = backupFreshness?.status === "pass" && backupWebhook?.status === "pass";
  const restoreRehearsed = restoreRehearsal?.status === "pass";
  const alertingReady = alertWebhook?.status === "pass" && deploymentMonitoring?.status === "pass";
  const releaseGateReady = latestReleaseGateApproved &&
    latestReleaseGateVerificationPassed &&
    latestReleaseGateIdentityReady &&
    input.identityProductionReleaseGateDigestBinding === "current";
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const blockers = Array.from(new Set([
    ...input.goLiveBlockers,
    backupReady ? null : "fresh-managed-backup-required",
    restoreRehearsed ? null : "backup-restore-rehearsal-required",
    alertingReady ? null : "incident-alerting-required",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker))));
  const nextActions = Array.from(new Set([
    backupReady ? null : backupFreshness?.nextAction ?? backupWebhook?.nextAction ?? "Run and deliver a verified managed backup before cutover.",
    restoreRehearsed ? null : restoreRehearsal?.nextAction ?? "Run POST /api/sena/governance/backup action=restore-dry-run with the cutover backup artifact.",
    alertingReady ? null : deploymentMonitoring?.nextAction ?? alertWebhook?.nextAction ?? "Connect signed ops alerts to the incident channel before cutover.",
    releaseGateReady ? null : releaseGateReview?.nextAction ?? "Record an approved release gate with passed verification evidence before cutover.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before rollback readiness is marked ready.",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes."
  ].filter((action): action is string => Boolean(action))));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveRollbackDrill,
    generatedAt: input.generatedAt,
    status: blockers.length > 0 ? "blocked" : input.goLiveStatus === "ready" ? "ready" : "review",
    summary: {
      goLiveStatus: input.goLiveStatus,
      backupReady: Boolean(backupReady),
      restoreRehearsed: Boolean(restoreRehearsed),
      alertingReady: Boolean(alertingReady),
      releaseGateReady: Boolean(releaseGateReady),
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-backup/v1",
      "sena-enterprise-backup-verification/v1",
      "sena-enterprise-backup-restore/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-ops-alert-delivery/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    runbook: {
      ownerEvidence: [
        ...(backupWebhook?.evidence ?? []),
        ...(deploymentMonitoring?.evidence ?? []),
        ...(releaseGateReview?.evidence ?? [])
      ].filter((entry) => /owner|runbook|webhook|releaseGate|verification/i.test(entry)),
      steps: [
        {
          id: "freeze-traffic",
          label: "Freeze institution traffic and route users to the incident channel.",
          owner: "institution-platform-owner",
          evidence: [
            "alertsApi=/api/sena/ops/alerts",
            "statusApi=/api/sena/ops/status",
            `alertingReady=${alertingReady ? "yes" : "no"}`
          ]
        },
        {
          id: "snapshot-and-verify",
          label: "Export, verify, and deliver the current team-scoped backup artifact.",
          owner: "team-manager-or-platform-owner",
          command: "GET /api/sena/governance/backup then POST /api/sena/governance/backup",
          evidence: [
            "backup=sena-enterprise-backup/v1",
            "backupVerification=sena-enterprise-backup-verification/v1",
            `backupReady=${backupReady ? "yes" : "no"}`
          ]
        },
        {
          id: "restore-dry-run",
          label: "Run a dry-run merge restore using the rollback backup artifact.",
          owner: "team-manager-or-platform-owner",
          command: "POST /api/sena/governance/backup action=restore-dry-run",
          evidence: [
            "restore=sena-enterprise-backup-restore/v1",
            `restoreRehearsed=${restoreRehearsed ? "yes" : "no"}`
          ]
        },
        {
          id: "rollback-release",
          label: "Rollback to the last approved deployment tag or keep the release gate blocked.",
          owner: "release-approver",
          evidence: [
            "releaseGate=sena-enterprise-release-gate-review/v1",
            `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
            `latestVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
            `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
            `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
            `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
            `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
            `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
            ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
            `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`
          ]
        },
        {
          id: "verify-after-rollback",
          label: "Run the full SENA verifier and attach the output to the release gate.",
          owner: "release-approver",
          command: verificationCommand,
          evidence: [
            "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
            "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1"
          ]
        }
      ]
    },
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "rollbackDrill=sena-enterprise-go-live-rollback-drill/v1",
      `goLiveStatus=${input.goLiveStatus}`,
      `backupFreshness=${backupFreshness?.status ?? "missing"}`,
      `backupWebhook=${backupWebhook?.status ?? "missing"}`,
      `restoreRehearsal=${restoreRehearsal?.status ?? "missing"}`,
      `alertWebhook=${alertWebhook?.status ?? "missing"}`,
      `deploymentMonitoring=${deploymentMonitoring?.status ?? "missing"}`,
      `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
      `blockers=${blockers.length}`
    ],
    nextActions
  };
}

function latestReleaseGateReadyEvidence(rehearsal: SenaEnterpriseGoLiveRehearsal) {
  return rehearsal.postCutoverMonitor.checks.find((check) => check.id === "release-verification")?.status === "pass";
}

function summarizePostCutoverObservations(
  observations: SenaEnterprisePostCutoverObservation[]
): SenaEnterprisePostCutoverObservationList["summary"] {
  const latest = observations[0];
  return {
    total: observations.length,
    active: observations.filter((observation) => observation.status === "active").length,
    ready: observations.filter((observation) => observation.status === "ready").length,
    blocked: observations.filter((observation) => observation.status === "blocked").length,
    latestStatus: latest?.status ?? "missing",
    ...(latest ? { latestObservationId: latest.id } : {})
  };
}

function postCutoverObservationList(
  observations: SenaEnterprisePostCutoverObservation[],
  input: { teamId?: string } = {}
): SenaEnterprisePostCutoverObservationList {
  const sorted = [...observations].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservations,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizePostCutoverObservations(sorted),
    observations: sorted
  };
}

function postCutoverObservationSample(input: {
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  releaseGateReady: boolean;
  rollbackReady: boolean;
}): SenaEnterprisePostCutoverObservationSample {
  return {
    recordedAt: now(),
    opsStatus: input.opsStatus.status,
    alertsStatus: input.opsAlerts.status,
    criticalAlerts: input.opsAlerts.summary.critical,
    warningAlerts: input.opsAlerts.summary.warning,
    warningAlertIds: input.opsAlerts.alerts
      .filter((alert) => alert.severity === "warning")
      .map((alert) => alert.id),
    releaseGateReady: input.releaseGateReady,
    rollbackReady: input.rollbackReady,
    evidence: [
      `opsStatus=${input.opsStatus.status}`,
      `alertsStatus=${input.opsAlerts.status}`,
      `criticalAlerts=${input.opsAlerts.summary.critical}`,
      `warningAlerts=${input.opsAlerts.summary.warning}`,
      `alertOwner=${input.opsAlerts.ownership.configured ? "configured" : "missing"}`,
      `alertRunbook=${input.opsAlerts.ownership.runbookUrl ? "configured" : "missing"}`,
      `releaseGateReady=${input.releaseGateReady}`,
      `rollbackReady=${input.rollbackReady}`
    ]
  };
}

function latestPostCutoverObservation(input: { teamId?: string } = {}) {
  const observations = readEnterpriseDb().postCutoverObservations ?? [];
  return observations
    .filter((observation) => !input.teamId || observation.teamId === input.teamId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

function observationElapsed(observation: SenaEnterprisePostCutoverObservation) {
  return Date.now() >= Date.parse(observation.requiredUntil);
}

function observationCadenceGaps(observation: SenaEnterprisePostCutoverObservation) {
  const maxGapMs = postCutoverObservationCadenceMinutes * 60 * 1000;
  const samples = [...observation.samples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const gaps: string[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const gapMs = Date.parse(samples[index].recordedAt) - Date.parse(samples[index - 1].recordedAt);
    if (gapMs > maxGapMs) {
      gaps.push(`${samples[index - 1].recordedAt}->${samples[index].recordedAt}`);
    }
  }
  return gaps;
}

function observationWarningsAcknowledged(
  observation: SenaEnterprisePostCutoverObservation,
  acknowledgedWarningAlertIds: string[]
) {
  const acknowledged = new Set(acknowledgedWarningAlertIds);
  const warningIds = Array.from(new Set(observation.samples.flatMap((sample) => sample.warningAlertIds)));
  if (warningIds.length === 0) return true;
  const acknowledgedAll = warningIds.every((warningId) => acknowledged.has(warningId));
  const ownerRunbookEvidence = observation.samples
    .filter((sample) => sample.warningAlertIds.length > 0)
    .every((sample) => sample.evidence.includes("alertOwner=configured") && sample.evidence.includes("alertRunbook=configured"));
  return acknowledgedAll && ownerRunbookEvidence;
}

function postCutoverObservationPreflight(input: { teamId: string }) {
  const rehearsal = getEnterpriseGoLiveRehearsal({ teamId: input.teamId });
  const opsStatus = getEnterpriseOpsStatus();
  const readiness = getEnterpriseDeploymentReadiness();
  const opsAlerts = getEnterpriseOpsAlerts(opsStatus, readiness);
  const releaseGateReady = latestReleaseGateReadyEvidence(rehearsal);
  const rollbackReady = rehearsal.rollbackDrill.status === "ready";
  return {
    rehearsal,
    opsStatus,
    opsAlerts,
    releaseGateReady,
    rollbackReady,
    blockers: [
      rehearsal.status === "ready" ? null : "go-live-rehearsal-not-ready",
      rollbackReady ? null : "rollback-drill-not-ready",
      releaseGateReady ? null : "release-gate-not-ready",
      opsStatus.status === "degraded" ? "ops-status-degraded" : null,
      opsAlerts.summary.critical === 0 ? null : "critical-alerts-firing"
    ].filter((blocker): blocker is string => Boolean(blocker))
  };
}

export function listEnterprisePostCutoverObservations(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterprisePostCutoverObservationList {
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for post-cutover observations.", 403, "post_cutover_observation_permission_denied");
  }
  const teamIdSet = new Set(teamIds);
  const observations = (readEnterpriseDb().postCutoverObservations ?? [])
    .filter((observation) => teamIdSet.has(observation.teamId));
  return postCutoverObservationList(observations, input);
}

export function startEnterprisePostCutoverObservation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  if (preflight.blockers.length > 0) {
    throw new SenaEnterpriseError(
      `Post-cutover observation cannot start until release, rollback, ops, and alert checks are ready: ${preflight.blockers.join(", ")}.`,
      409,
      "post_cutover_observation_start_blocked"
    );
  }
  const startedAt = now();
  const requiredUntil = new Date(Date.parse(startedAt) + postCutoverObservationMinutes * 60 * 1000).toISOString();
  const observation: SenaEnterprisePostCutoverObservation = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservation,
    id: id("post-cutover"),
    teamId: input.teamId,
    environment: requiredReleaseGateText(input.environment, "environment"),
    releaseVersion: requiredReleaseGateText(input.releaseVersion, "releaseVersion"),
    status: "active",
    startedAt,
    requiredUntil,
    startedByUserId: context.user.id,
    samples: [
      postCutoverObservationSample({
        opsStatus: preflight.opsStatus,
        opsAlerts: preflight.opsAlerts,
        releaseGateReady: preflight.releaseGateReady,
        rollbackReady: preflight.rollbackReady
      })
    ],
    acknowledgedWarningAlertIds: [],
    evidence: [
      "schema=sena-enterprise-post-cutover-observation/v1",
      `requiredMinutes=${postCutoverObservationMinutes}`,
      `cadenceMinutes=${postCutoverObservationCadenceMinutes}`,
      "startPreflight=pass"
    ]
  };
  db.postCutoverObservations.unshift(observation);
  db.postCutoverObservations = db.postCutoverObservations.slice(0, 1000);
  appendAudit(db, {
    event: "ops.post_cutover_observation.start",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      environment: observation.environment,
      releaseVersion: observation.releaseVersion,
      requiredUntil: observation.requiredUntil,
      samples: observation.samples.length
    }
  });
  saveDb(db);
  return observation;
}

export function recordEnterprisePostCutoverObservationSample(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationSampleInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const observation = (db.postCutoverObservations ?? [])
    .find((candidate) => candidate.id === input.observationId && candidate.teamId === input.teamId);
  if (!observation) {
    throw new SenaEnterpriseError("Post-cutover observation was not found.", 404, "post_cutover_observation_not_found");
  }
  if (observation.status !== "active") {
    throw new SenaEnterpriseError("Post-cutover observation sample can only be recorded while observation is active.", 409, "post_cutover_observation_not_active");
  }
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  observation.samples.push(postCutoverObservationSample({
    opsStatus: preflight.opsStatus,
    opsAlerts: preflight.opsAlerts,
    releaseGateReady: preflight.releaseGateReady,
    rollbackReady: preflight.rollbackReady
  }));
  const latestSample = observation.samples[observation.samples.length - 1];
  appendAudit(db, {
    event: "ops.post_cutover_observation.sample",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      samples: observation.samples.length,
      opsStatus: latestSample?.opsStatus ?? null,
      alertsStatus: latestSample?.alertsStatus ?? null,
      criticalAlerts: latestSample?.criticalAlerts ?? null,
      warningAlerts: latestSample?.warningAlerts ?? null
    }
  });
  saveDb(db);
  return observation;
}

export function completeEnterprisePostCutoverObservation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationCompletionInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const observation = (db.postCutoverObservations ?? [])
    .find((candidate) => candidate.id === input.observationId && candidate.teamId === input.teamId);
  if (!observation) {
    throw new SenaEnterpriseError("Post-cutover observation was not found.", 404, "post_cutover_observation_not_found");
  }
  if (observation.status !== "active") {
    throw new SenaEnterpriseError("Post-cutover observation can only be completed once while active.", 409, "post_cutover_observation_not_active");
  }
  if (!observationElapsed(observation)) {
    throw new SenaEnterpriseError("Post-cutover observation requires a full 60-minute observation window before completion.", 409, "post_cutover_observation_window_incomplete");
  }
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  const latestSample = observation.samples.at(-1);
  if (!latestSample || Date.parse(latestSample.recordedAt) < Date.parse(observation.requiredUntil)) {
    observation.samples.push(postCutoverObservationSample({
      opsStatus: preflight.opsStatus,
      opsAlerts: preflight.opsAlerts,
      releaseGateReady: preflight.releaseGateReady,
      rollbackReady: preflight.rollbackReady
    }));
  }
  const gaps = observationCadenceGaps(observation);
  const degradedSamples = observation.samples.filter((sample) => sample.opsStatus === "degraded");
  const criticalSamples = observation.samples.filter((sample) => sample.criticalAlerts > 0);
  const releaseRollbackBlockedSamples = observation.samples.filter((sample) => !sample.releaseGateReady || !sample.rollbackReady);
  const acknowledgedWarningAlertIds = Array.from(new Set(input.acknowledgedWarningAlertIds ?? []));
  const completionBlockers = [
    ...preflight.blockers,
    gaps.length > 0 ? "post-cutover-observation-cadence-gap" : null,
    degradedSamples.length > 0 ? "post-cutover-observation-degraded-sample" : null,
    criticalSamples.length > 0 ? "post-cutover-observation-critical-alert-sample" : null,
    releaseRollbackBlockedSamples.length > 0 ? "post-cutover-observation-release-or-rollback-sample-blocked" : null,
    observationWarningsAcknowledged(observation, acknowledgedWarningAlertIds) ? null : "post-cutover-observation-warning-alerts-unacknowledged"
  ].filter((blocker): blocker is string => Boolean(blocker));
  if (completionBlockers.length > 0) {
    throw new SenaEnterpriseError(
      `Post-cutover observation cannot complete: ${completionBlockers.join(", ")}.`,
      409,
      "post_cutover_observation_completion_blocked"
    );
  }
  observation.status = "ready";
  observation.completedAt = now();
  observation.completedByUserId = context.user.id;
  observation.acknowledgedWarningAlertIds = acknowledgedWarningAlertIds;
  observation.evidence = Array.from(new Set([
    ...observation.evidence,
    "completionPreflight=pass",
    `samples=${observation.samples.length}`,
    `acknowledgedWarningAlertIds=${acknowledgedWarningAlertIds.length}`,
    "status=ready"
  ]));
  appendAudit(db, {
    event: "ops.post_cutover_observation.complete",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      samples: observation.samples.length,
      acknowledgedWarningAlertIds: acknowledgedWarningAlertIds.join("|") || "none",
      completedAt: observation.completedAt
    }
  });
  saveDb(db);
  return observation;
}

function buildEnterpriseGoLiveMonitor(input: {
  generatedAt: string;
  goLiveStatus: SenaEnterpriseGoLiveRehearsal["status"];
  goLiveBlockers: string[];
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  rollbackDrill: SenaEnterpriseGoLiveRollbackDrill;
  latestObservation: SenaEnterprisePostCutoverObservationList;
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
  verificationCommands: string[];
  identityProductionReleaseGateDigestBinding: "current" | "stale" | "missing";
}): SenaEnterpriseGoLiveMonitor {
  const criticalAlerts = input.opsAlerts.summary.critical;
  const warningAlerts = input.opsAlerts.summary.warning;
  const latestReleaseGateApproved = input.latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = input.latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const releaseGateReady = latestReleaseGateApproved &&
    latestReleaseGateVerificationPassed &&
    latestReleaseGateIdentityReady &&
    input.identityProductionReleaseGateDigestBinding === "current";
  const rollbackReady = input.rollbackDrill.status === "ready";
  const latestObservation = input.latestObservation.observations[0];
  const postCutoverObservationReady = latestObservation?.status === "ready";
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const checks: SenaEnterpriseGoLiveMonitor["checks"] = [
    {
      id: "go-live-rehearsal",
      label: "Go-live rehearsal status",
      status: input.goLiveStatus === "ready" ? "pass" : "blocked",
      evidence: [
        "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
        `status=${input.goLiveStatus}`,
        `blockers=${input.goLiveBlockers.length}`
      ],
      nextAction: input.goLiveStatus === "ready"
        ? "Keep the current go-live rehearsal attached to the cutover record."
        : "Resolve go-live rehearsal blockers before starting the post-cutover observation window."
    },
    {
      id: "ops-status",
      label: "Ops status endpoint",
      status: input.opsStatus.status === "degraded" ? "blocked" : input.opsStatus.status === "ready" ? "pass" : "watch",
      evidence: [
        `opsStatus=${input.opsStatus.status}`,
        `storageWritable=${input.opsStatus.storage.writable}`,
        `lockProbe=${input.opsStatus.storage.lockProbe}`,
        `backupStatus=${input.opsStatus.backup.status}`,
        `uptimeSeconds=${input.opsStatus.deployment.uptimeSeconds}`
      ],
      nextAction: input.opsStatus.status === "ready"
        ? "Keep status and metrics polling active throughout the observation window."
        : "Keep the observation window open until ops status is ready and degraded checks are cleared."
    },
    {
      id: "critical-alerts",
      label: "Critical ops alerts",
      status: criticalAlerts === 0 ? "pass" : "blocked",
      evidence: [
        `alertsStatus=${input.opsAlerts.status}`,
        `critical=${criticalAlerts}`,
        `warning=${warningAlerts}`,
        `firing=${input.opsAlerts.summary.firing}`
      ],
      nextAction: criticalAlerts === 0
        ? "Keep alert delivery connected and watch for regressions."
        : "Resolve critical firing alerts before closing cutover observation."
    },
    {
      id: "warning-alerts",
      label: "Warning ops alerts",
      status: warningAlerts === 0 ? "pass" : "watch",
      evidence: [
        `warning=${warningAlerts}`,
        `owner=${input.opsAlerts.ownership.owner}`,
        `runbook=${input.opsAlerts.ownership.runbookUrl ? "configured" : "missing"}`
      ],
      nextAction: warningAlerts === 0
        ? "No warning alerts are firing."
        : "Keep watch status until warning alerts are acknowledged or cleared."
    },
    {
      id: "rollback-drill",
      label: "Rollback drill readiness",
      status: rollbackReady ? "pass" : "blocked",
      evidence: [
        `rollbackDrill=${input.rollbackDrill.schemaVersion}`,
        `rollbackStatus=${input.rollbackDrill.status}`,
        `rollbackBlockers=${input.rollbackDrill.summary.blockers.length}`
      ],
      nextAction: rollbackReady
        ? "Keep the rollback drill attached to the cutover handoff."
        : "Resolve rollback drill blockers before closing cutover observation."
    },
    {
      id: "post-cutover-observation",
      label: "60-minute post-cutover observation",
      status: postCutoverObservationReady ? "pass" : "blocked",
      evidence: [
        `observationSchema=${input.latestObservation.schemaVersion}`,
        `observationId=${latestObservation?.id ?? "missing"}`,
        `observationStatus=${latestObservation?.status ?? "missing"}`,
        `observationSamples=${latestObservation?.samples.length ?? 0}`,
        `requiredUntil=${latestObservation?.requiredUntil ?? "missing"}`,
        `completedAt=${latestObservation?.completedAt ?? "missing"}`
      ],
      nextAction: postCutoverObservationReady
        ? "Keep the completed 60-minute observation attached to the cutover record."
        : "Start, sample, and complete the 60-minute post-cutover observation before approving go-live."
    },
    {
      id: "release-verification",
      label: "Release gate verification",
      status: releaseGateReady ? "pass" : "blocked",
      evidence: [
        "releaseGate=sena-enterprise-release-gate-review/v1",
        `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
        `latestVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
        `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
        `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
        `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
        `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
        `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
        ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
        `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
        `verificationCommand=${verificationCommand}`
      ],
      nextAction: releaseGateReady
        ? "Keep the passed verifier output attached to the release gate."
        : "Run the full verifier and record an approved release gate with passed verification evidence, including identity production evidence readiness."
    }
  ];
  const blockers = Array.from(new Set([
    input.goLiveStatus === "ready" ? null : "go-live-rehearsal-not-ready",
    input.opsStatus.status === "degraded" ? "ops-status-degraded" : null,
    criticalAlerts === 0 ? null : "critical-ops-alerts-firing",
    rollbackReady ? null : "rollback-drill-not-ready",
    postCutoverObservationReady ? null : "post-cutover-observation-required",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker))));
  const watchItems = checks.filter((check) => check.status === "watch");
  const status: SenaEnterpriseGoLiveMonitor["status"] = blockers.length > 0 ? "blocked" : watchItems.length > 0 ? "watch" : "ready";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveMonitor,
    generatedAt: input.generatedAt,
    status,
    observationWindow: {
      recommendedMinutes: 60,
      exitCriteria: [
        "No critical ops alerts firing during the observation window.",
        "Warning ops alerts are acknowledged, cleared, or assigned to an owner.",
        "Ops status remains ready or non-degraded for the full observation window.",
        "Rollback drill evidence remains attached and ready.",
        "The full SENA pilot verifier has passed and is attached to the release gate."
      ]
    },
    summary: {
      goLiveStatus: input.goLiveStatus,
      opsStatus: input.opsStatus.status,
      alertsStatus: input.opsAlerts.status,
      criticalAlerts,
      warningAlerts,
      releaseGateReady,
      rollbackReady,
      postCutoverObservationReady,
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-ops-status/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-ops-alert-delivery/v1",
      "sena-enterprise-go-live-rollback-drill/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    latestObservation: input.latestObservation,
    checks,
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "postCutoverMonitor=sena-enterprise-go-live-monitor/v1",
      `status=${status}`,
      `opsStatus=${input.opsStatus.status}`,
      `alertsStatus=${input.opsAlerts.status}`,
      `criticalAlerts=${criticalAlerts}`,
      `warningAlerts=${warningAlerts}`,
      `rollbackDrill=${input.rollbackDrill.status}`,
      `postCutoverObservation=${latestObservation?.status ?? "missing"}`,
      `postCutoverObservationId=${latestObservation?.id ?? "missing"}`,
      `postCutoverObservationSamples=${latestObservation?.samples.length ?? 0}`,
      `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
      `observationWindowMinutes=60`
    ],
    nextActions: Array.from(new Set(checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.nextAction)))
  };
}

function buildEnterpriseGoLiveRehearsal(input: {
  deployment: SenaEnterpriseOrganizationDeploymentPackage;
  readiness: SenaEnterpriseDeploymentReadiness;
  governance: SenaEnterpriseGovernanceStatus;
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  latestObservation: SenaEnterprisePostCutoverObservationList;
}): SenaEnterpriseGoLiveRehearsal {
  const nativeAdapterProductionBlocking = input.deployment.nativeAdapterCertification.summary.productionBlocking;
  const latestReleaseGate = input.deployment.releaseGate.latestReview;
  const latestReleaseGateApproved = latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const identityProductionReleaseGateDigestBinding = !latestReleaseGateIdentitySnapshot?.evidenceBindingDigest || !input.deployment.identityProductionHandoff.evidenceBindingDigest
    ? "missing"
    : latestReleaseGateIdentitySnapshot.evidenceBindingDigest === input.deployment.identityProductionHandoff.evidenceBindingDigest
      ? "current"
      : "stale";
  const blockers = [
    input.readiness.summary.blockingReview === 0 ? null : "deployment-readiness-blocking-items",
    input.deployment.saasOperationsReadiness.status === "ready" ? null : "saas-operations-not-ready",
    nativeAdapterProductionBlocking === 0 ? null : "native-adapter-certification-production-blockers",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker));
  const governanceReviewItems = input.governance.checks.filter((check) => check.status === "review").length;
  const advisoryItems = input.readiness.summary.advisoryReview + governanceReviewItems;
  const generatedAt = now();
  const verificationCommands = Array.from(new Set([
    ...input.readiness.runbook.verificationCommands,
    latestReleaseGate?.verificationCommand
  ].filter((command): command is string => Boolean(command))));
  const nextActions = Array.from(new Set([
    ...input.readiness.blocking.filter((item) => item.status === "review").map((item) => item.nextAction),
    ...input.deployment.saasOperationsReadiness.nextActions,
    ...input.deployment.nativeAdapterCertification.nextActions,
    latestReleaseGateApproved && latestReleaseGateVerificationPassed ? null : "Record an approved release gate with passed verification evidence after running the full pilot verifier.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before go-live rehearsal is marked ready.",
    identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes.",
    advisoryItems === 0 ? null : "Resolve advisory readiness and governance review items before institution production cutover."
  ].filter((action): action is string => Boolean(action))));

  const status: SenaEnterpriseGoLiveRehearsal["status"] = blockers.length > 0
    ? "blocked"
    : advisoryItems > 0 || input.deployment.status !== "ready"
      ? "review"
      : "ready";
  const releaseGateDraft = buildEnterpriseReleaseGateDraft({
    generatedAt,
    status,
    blockers,
    verificationCommands,
    latestReleaseGate
  });
  const rollbackDrill = buildEnterpriseGoLiveRollbackDrill({
    generatedAt,
    goLiveStatus: status,
    goLiveBlockers: blockers,
    readiness: input.readiness,
    governance: input.governance,
    verificationCommands,
    latestReleaseGate,
    identityProductionReleaseGateDigestBinding
  });
  const postCutoverMonitor = buildEnterpriseGoLiveMonitor({
    generatedAt,
    goLiveStatus: status,
    goLiveBlockers: blockers,
    opsStatus: input.opsStatus,
    opsAlerts: input.opsAlerts,
    rollbackDrill,
    latestObservation: input.latestObservation,
    latestReleaseGate,
    verificationCommands,
    identityProductionReleaseGateDigestBinding
  });
  const identityProductionRequestPacketEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = input.deployment.identityProductionHandoff.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  const identityProductionHandoffEvidence = [
    identityProductionRequestPacketEvidence("requestPacketPolicyHash", "identityProductionRequestPacketPolicyHash"),
    identityProductionRequestPacketEvidence("requestPacketPolicyBinding", "identityProductionRequestPacketPolicyBinding"),
    identityProductionRequestPacketEvidence("receiptReviewRequests", "identityProductionReceiptReviewRequests"),
    identityProductionRequestPacketEvidence("evidenceUrlAllowedHosts", "identityProductionEvidenceUrlAllowedHosts")
  ].filter((evidence): evidence is string => Boolean(evidence));
  const identityProductionHandoffHostBinding = input.deployment.identityProductionHandoff.evidenceUrlHostBinding;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal,
    generatedAt,
    status,
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/go-live-rehearsal",
      filename: "sena-enterprise-go-live-rehearsal.json"
    },
    rehearsal: {
      deploymentPackage: input.deployment.schemaVersion,
      deploymentReadiness: input.readiness.schemaVersion,
      governance: input.governance.schemaVersion,
      platformDecisionRegister: input.deployment.platformDecisionRegister.schemaVersion,
      nativeAdapterCertification: input.deployment.nativeAdapterCertification.schemaVersion,
      saasOperationsReadiness: input.deployment.saasOperationsReadiness.schemaVersion,
      releaseGate: input.deployment.releaseGate.schemaVersion
    },
    summary: {
      blockingItems: input.readiness.summary.blockingReview,
      advisoryItems: input.readiness.summary.advisoryReview,
      governanceReviewItems,
      openPlatformDecisions: input.deployment.summary.openPlatformDecisions,
      acceptedPlatformDecisions: input.deployment.summary.acceptedPlatformDecisions,
      nativeAdapterProductionBlocking,
      saasOperationsStatus: input.deployment.saasOperationsReadiness.status,
      releaseGateReviews: input.deployment.releaseGate.summary.total,
      latestReleaseGateStatus: latestReleaseGate?.decision,
      latestReleaseGateVerificationStatus: latestReleaseGate?.verificationEvidence.status,
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-deployment-readiness/v1",
      "sena-enterprise-organization-deployment/v1",
      "sena-enterprise-governance/v1",
      "sena-enterprise-platform-decision-register/v1",
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-saas-operations-readiness/v1",
      "sena-enterprise-go-live-rollback-drill/v1",
      "sena-enterprise-go-live-monitor/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    verificationCommands,
    identityProductionHandoff: input.deployment.identityProductionHandoff,
    releaseGateDraft,
    rollbackDrill,
    postCutoverMonitor,
    evidence: [
      "redaction=secret-values-excluded",
      "endpointValues=hashed",
      `deploymentPackage=${input.deployment.schemaVersion}`,
      `deploymentReadiness=${input.readiness.schemaVersion}`,
      `governance=${input.governance.schemaVersion}`,
      `platformDecisionRegister=${input.deployment.platformDecisionRegister.schemaVersion}`,
      `nativeAdapterCertification=${input.deployment.nativeAdapterCertification.schemaVersion}`,
      `nativeAdapterProductionBlocking=${nativeAdapterProductionBlocking}`,
      `saasOperations=${input.deployment.saasOperationsReadiness.schemaVersion}`,
      `saasOperationsStatus=${input.deployment.saasOperationsReadiness.status}`,
      `releaseGate=${input.deployment.releaseGate.schemaVersion}`,
      `releaseGateReviews=${input.deployment.releaseGate.summary.total}`,
      `latestReleaseGate=${latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestReleaseGateIdentityProductionEvidenceDigest=${latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing"}`,
      `latestReleaseGateIdentityEvidenceBindingDigest=${latestReleaseGateIdentitySnapshot?.evidenceBindingDigest ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionHandoff=${input.deployment.identityProductionHandoff.schemaVersion}`,
      `identityProductionHandoffStatus=${input.deployment.identityProductionHandoff.status}`,
      `identityProductionHandoffMissingEvidence=${input.deployment.identityProductionHandoff.evidenceManifest.missingEvidenceIds.length}`,
      `identityProductionRequestBlockers=${input.deployment.identityProductionHandoff.platformRequestPacket.summary.blockingRequests}`,
      `identityProductionHandoffDigest=${input.deployment.identityProductionHandoff.dossierDigest ?? "missing"}`,
      `identityProductionHandoffEvidenceBindingDigest=${input.deployment.identityProductionHandoff.evidenceBindingDigest ?? "missing"}`,
      `identityProductionReceiptArchiveManifestDigest=${input.deployment.identityProductionHandoff.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `identityProductionReceiptArchiveReadyForArchive=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.readyForArchive}`,
      `identityProductionReceiptArchiveReview=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.reviewArchives}`,
      `identityProductionReceiptArchiveMissingReceipts=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.missingReceipts}`,
      `identityProductionReceiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      `identityProductionReleaseGateDigestBinding=${identityProductionReleaseGateDigestBinding}`,
      ...identityProductionHandoffEvidence,
      `identityProductionHandoffHostBinding=${identityProductionHandoffHostBinding.status}`,
      `identityProductionHandoffAllowedHostConfig=${identityProductionHandoffHostBinding.allowedHostConfigStatus}`,
      `identityProductionHandoffAllowedHosts=${identityProductionHandoffHostBinding.allowedHostCount}`,
      `identityProductionHandoffInvalidAllowedHosts=${identityProductionHandoffHostBinding.invalidAllowedHostCount}`,
      `postCutoverMonitor=${postCutoverMonitor.schemaVersion}`
    ],
    nextActions
  };
}

export function getEnterpriseGoLiveRehearsal(input: { teamId?: string } = {}): SenaEnterpriseGoLiveRehearsal {
  const deployment = getEnterpriseOrganizationDeploymentPackage({ teamId: input.teamId });
  const readiness = getEnterpriseDeploymentReadiness();
  const governance = getEnterpriseGovernanceStatus();
  const opsStatus = getEnterpriseOpsStatus();
  const opsAlerts = getEnterpriseOpsAlerts(opsStatus, readiness);
  const latestObservation = postCutoverObservationList(
    (readEnterpriseDb().postCutoverObservations ?? [])
      .filter((observation) => !input.teamId || observation.teamId === input.teamId),
    { teamId: input.teamId }
  );
  return buildEnterpriseGoLiveRehearsal({ deployment, readiness, governance, opsStatus, opsAlerts, latestObservation });
}

function summarizeEnterpriseCapabilityAudit(capabilities: SenaEnterpriseCapabilityAuditItem[]): SenaEnterpriseCapabilityAudit["summary"] {
  return {
    capabilities: capabilities.length,
    ready: capabilities.filter((capability) => capability.status === "ready").length,
    review: capabilities.filter((capability) => capability.status === "review").length,
    blocked: capabilities.filter((capability) => capability.status === "blocked").length,
    platformDecisionItems: new Set(capabilities.flatMap((capability) => capability.remainingPlatformDecisions)).size
  };
}

function enterpriseCapabilityAuditStatus(capabilities: SenaEnterpriseCapabilityAuditItem[]): SenaEnterpriseCapabilityAuditStatus {
  if (capabilities.some((capability) => capability.status === "blocked")) return "blocked";
  if (capabilities.some((capability) => capability.status === "review")) return "review";
  return "ready";
}

export function getEnterpriseCapabilityAudit(input: { teamId?: string } = {}): SenaEnterpriseCapabilityAudit {
  const db = readEnterpriseDb();
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const deployment = getEnterpriseOrganizationDeploymentPackage({ teamId: input.teamId });
  const readiness = getEnterpriseDeploymentReadiness();
  const governance = getEnterpriseGovernanceStatus();
  const security = getEnterpriseSecurityPosture();
  const goLiveRehearsal = getEnterpriseGoLiveRehearsal({ teamId: input.teamId });
  const readinessItem = (id: string) => [...readiness.blocking, ...readiness.advisory].find((item) => item.id === id);
  const governanceItem = (id: string) => governance.checks.find((check) => check.id === id);
  const platformDecision = (id: string) => deployment.platformDecisionRegister.decisions.find((decision) => decision.id === id);
  const platformDecisionEvidenceStatus = (id: string) => {
    const decision = platformDecision(id);
    if (!decision) return "missing";
    if (decision.acceptedBridge) return "accepted-bridge";
    if (decision.status === "ready") return "ready-without-platform-acceptance";
    return decision.status;
  };
  const pendingPlatformDecision = (id: string) => {
    const decision = platformDecision(id);
    return decision && !decision.acceptedBridge && (decision.productionBlocking || decision.status === "open") ? id : null;
  };
  const pending = (...ids: string[]) => ids
    .map((id) => pendingPlatformDecision(id))
    .filter((id): id is string => Boolean(id));
  const pendingPlatformAcceptance = (...ids: string[]) => ids
    .filter((id) => {
      const decision = platformDecision(id);
      return !decision || (decision.productionBlocking && !decision.acceptedBridge);
    });
  const pendingProductionBlockingPlatformDecisions = (...ids: string[]) => ids
    .filter((id) => {
      const decision = platformDecision(id);
      if (!decision) return true;
      return decision.productionBlocking && (
        decision.status === "open" ||
        !decision.acceptedBridge ||
        missingPlatformDecisionProductionEvidence(decision).length > 0
      );
    });
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const latestAuthPlatformAcceptances = latestPlatformDecisionAcceptances(platformDecisionAcceptances);
  const authRotationFreshness = buildEnterpriseIdentityRotationFreshness(latestAuthPlatformAcceptances);
  const authRotationExpiredIds = authRotationFreshness.checks
    .filter((check) => check.status === "expired")
    .map((check) => check.id);
  const authRotationReviewDecisionIds = authRotationFreshness.checks
    .filter((check) => check.status === "expired" || check.status === "missing")
    .map((check) => check.decisionId);
  const idpAcceptance = latestAuthPlatformAcceptances.get("institution-idp-approval");
  const authIdpProductionEvidenceReceipt = idpAcceptance
    ? platformDecisionProductionEvidenceReceipt(idpAcceptance) ?? idpAcceptance.productionEvidenceReceipt
    : undefined;
  const authIdpAcceptanceEvidence = idpAcceptanceEvidence(idpAcceptance);
  const idpAcceptanceEvidenceReady = Boolean(
    idpAcceptance?.status === "accepted" &&
    idpAcceptance.acceptedBridge &&
    authIdpAcceptanceEvidence.tenant &&
    authIdpAcceptanceEvidence.callback &&
    authIdpAcceptanceEvidence.providerSecrets &&
    authIdpAcceptanceEvidence.secretStoreReference &&
    authIdpAcceptanceEvidence.secretRotation &&
    authIdpAcceptanceEvidence.evidenceUrl
  );
  const provisioningOwnerAcceptance = latestAuthPlatformAcceptances.get("institution-provisioning-owner");
  const authProvisioningOwnerProductionEvidenceReceipt = provisioningOwnerAcceptance
    ? platformDecisionProductionEvidenceReceipt(provisioningOwnerAcceptance) ?? provisioningOwnerAcceptance.productionEvidenceReceipt
    : undefined;
  const authProvisioningOwnerAcceptanceEvidence = provisioningOwnerAcceptanceEvidence(provisioningOwnerAcceptance);
  const provisioningOwnerAcceptanceEvidenceReady = Boolean(
    provisioningOwnerAcceptance?.status === "accepted" &&
    provisioningOwnerAcceptance.acceptedBridge &&
    authProvisioningOwnerAcceptanceEvidence.owner &&
    authProvisioningOwnerAcceptanceEvidence.scimOrIdp &&
    authProvisioningOwnerAcceptanceEvidence.bearerTokenRotation &&
    authProvisioningOwnerAcceptanceEvidence.lifecycleGuardrails &&
    authProvisioningOwnerAcceptanceEvidence.evidenceUrl
  );
  const authIdpDecisionMissingProductionEvidence = platformDecision("institution-idp-approval")
    ? missingPlatformDecisionProductionEvidence(platformDecision("institution-idp-approval")!)
    : [];
  const authProvisioningOwnerMissingProductionEvidence = platformDecision("institution-provisioning-owner")
    ? missingPlatformDecisionProductionEvidence(platformDecision("institution-provisioning-owner")!)
    : [];
  const authIdpDecisionBaseStatus = platformDecisionEvidenceStatus("institution-idp-approval");
  const authProvisioningOwnerBaseStatus = platformDecisionEvidenceStatus("institution-provisioning-owner");
  const authIdpDecisionStatus = authIdpDecisionBaseStatus === "accepted-bridge" && (
    !idpAcceptanceEvidenceReady ||
    authIdpDecisionMissingProductionEvidence.length > 0
  )
    ? "accepted-bridge-missing-evidence"
    : authIdpDecisionBaseStatus;
  const authProvisioningOwnerStatus = authProvisioningOwnerBaseStatus === "accepted-bridge" && (
    !provisioningOwnerAcceptanceEvidenceReady ||
    authProvisioningOwnerMissingProductionEvidence.length > 0
  )
    ? "accepted-bridge-missing-evidence"
    : authProvisioningOwnerBaseStatus;
  const authSsoGovernanceStatus = governanceItem("oauth-oidc-sso")?.status ?? "review";
  const authProvisioningReadinessStatus = readinessItem("provisioning-token")?.status ?? "review";
  const authSecretHardeningStatus = readinessItem("secret-hardening")?.status ?? "review";
  const authSsoSecrets = governance.auth.oidcProviders
    .map((provider) => `${provider.provider}:${provider.clientSecretStrength}`)
    .join("|") || "none";
  const authIdentityReceiptVerifierStatus = {
    idp: authIdpProductionEvidenceReceipt?.verifierStatus ?? "missing",
    provisioning: authProvisioningOwnerProductionEvidenceReceipt?.verifierStatus ?? "missing"
  };
  const latestReleaseGateIdentitySnapshot = deployment.releaseGate.latestReview?.identityProductionSnapshot;
  const authIdentityReleaseGateDigestBinding = !latestReleaseGateIdentitySnapshot?.evidenceBindingDigest || !deployment.identityProductionHandoff.evidenceBindingDigest
    ? "missing"
    : latestReleaseGateIdentitySnapshot.evidenceBindingDigest === deployment.identityProductionHandoff.evidenceBindingDigest
      ? "current"
      : "stale";
  const authIdentityReleaseGateDigestBindingRequired = deployment.releaseGate.latestReview?.decision === "approved" &&
    latestReleaseGateIdentitySnapshot?.status === "ready";
  const authIdentityReleaseGateDigestBindingCurrent = !authIdentityReleaseGateDigestBindingRequired ||
    authIdentityReleaseGateDigestBinding === "current";
  const authIdentityReceiptReviewDecisionIds = [
    authIdentityReceiptVerifierStatus.idp !== "ready" ? "institution-idp-approval" : null,
    authIdentityReceiptVerifierStatus.provisioning !== "ready" ? "institution-provisioning-owner" : null
  ].filter((id): id is SenaEnterpriseIdentityProductionDecisionId => Boolean(id));
  const authProductionEvidenceStatus = selfManagedEnterprise
    ? authSecretHardeningStatus === "pass" ? "ready" : "review"
    : authIdpDecisionStatus === "accepted-bridge" &&
      authProvisioningOwnerStatus === "accepted-bridge" &&
      authSsoGovernanceStatus === "pass" &&
      authProvisioningReadinessStatus === "pass" &&
      authSecretHardeningStatus === "pass" &&
      authRotationFreshness.status === "ready" &&
      authIdentityReceiptReviewDecisionIds.length === 0 &&
      authIdentityReleaseGateDigestBindingCurrent
      ? "ready"
      : "review";
  const capability = (item: SenaEnterpriseCapabilityAuditItem): SenaEnterpriseCapabilityAuditItem => item;
  const authRemainingPlatformDecisions = selfManagedEnterprise
    ? []
    : [
      ...pendingPlatformAcceptance("institution-idp-approval", "institution-provisioning-owner"),
      authIdpDecisionBaseStatus === "accepted-bridge" && (
        !idpAcceptanceEvidenceReady ||
        authIdpDecisionMissingProductionEvidence.length > 0
      ) ? "institution-idp-approval" : null,
      authSsoGovernanceStatus !== "pass" ? "institution-idp-approval" : null,
      authProvisioningOwnerBaseStatus === "accepted-bridge" && (
        !provisioningOwnerAcceptanceEvidenceReady ||
        authProvisioningOwnerMissingProductionEvidence.length > 0
      ) ? "institution-provisioning-owner" : null,
      ...authIdentityReceiptReviewDecisionIds,
      ...authRotationReviewDecisionIds,
      authIdentityReleaseGateDigestBindingCurrent ? null : "institution-idp-approval",
      authIdentityReleaseGateDigestBindingCurrent ? null : "institution-provisioning-owner"
    ].filter((id): id is string => Boolean(id));
  const identityRequestPacket = deployment.identityProductionHandoff.platformRequestPacket;
  const authCutoverChecklist = deployment.identityProductionHandoff.cutoverChecklist;
  const identityEvidenceUrlHostBinding = deployment.identityProductionHandoff.evidenceUrlHostBinding;
  const identityReceiptArchiveManifest = deployment.identityProductionHandoff.receiptArchiveManifest;
  const authIdentityEvidenceUrlHostBindingAction = identityEvidenceUrlHostBinding.staleDecisionIds.length > 0
    ? `Renew institution identity evidence URLs for ${identityEvidenceUrlHostBinding.staleDecisionIds.join(", ")} so accepted evidence hosts match the current allowlist.`
    : null;
  const authIdentityTechnicalReadinessAction = [
    "identity-evidence-host-allowlist",
    "identity-idp-tenant-binding",
    "identity-secret-version-binding",
    "identity-secret-store-reference",
    "identity-secret-rotation-cadence",
    "identity-lifecycle-owner-mode"
  ]
    .map((id) => readinessItem(id))
    .find((item) => item?.status === "review")
    ?.nextAction ?? null;
  const authIdentityRequestAction = identityRequestPacket.requests
    .find((request) => request.blocking)
    ?.nextActions[0] ?? null;
  const identityRequestPacketEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = identityRequestPacket.evidence.find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  const identityRequestEvidenceIds = (
    decisionId: SenaEnterpriseIdentityProductionDecisionId,
    sourceKey: "missingProductionEvidenceIds" | "missingTechnicalPrerequisiteEvidenceIds",
    targetKey: string
  ) => {
    const request = identityRequestPacket.requests.find((item) => item.decisionId === decisionId);
    const evidenceIds = request?.[sourceKey] ?? [];
    return `${targetKey}=${evidenceIds.join("|") || "none"}`;
  };
  const authIdentitySubmissionGuardrailEvidence = [
      `identityRequestPacket=${identityRequestPacket.schemaVersion}`,
      identityRequestPacketEvidence("requests", "identityRequests"),
      identityRequestPacketEvidence("blockingRequests", "identityRequestBlockers"),
      identityRequestPacketEvidence("missingProductionEvidence", "identityMissingProductionEvidence"),
      identityRequestPacketEvidence("missingTechnicalPrerequisites", "identityMissingTechnicalPrerequisites"),
      identityRequestPacketEvidence("readyRequests", "identityReadyRequests"),
      identityRequestPacketEvidence("requestPacketPolicyHash", "identityRequestPacketPolicyHash"),
      identityRequestPacketEvidence("requestPacketPolicyBinding", "identityRequestPacketPolicyBinding"),
      identityRequestEvidenceIds("institution-idp-approval", "missingProductionEvidenceIds", "identityIdpMissingProductionEvidenceIds"),
      identityRequestEvidenceIds("institution-provisioning-owner", "missingProductionEvidenceIds", "identityProvisioningMissingProductionEvidenceIds"),
      identityRequestEvidenceIds("institution-idp-approval", "missingTechnicalPrerequisiteEvidenceIds", "identityIdpMissingTechnicalPrerequisites"),
      identityRequestEvidenceIds("institution-provisioning-owner", "missingTechnicalPrerequisiteEvidenceIds", "identityProvisioningMissingTechnicalPrerequisites"),
      identityRequestPacketEvidence("receiptReviewRequests", "identityReceiptReviewRequests"),
      `identityProductionEvidenceSubmission=${identityRequestPacket.submission.method}:${identityRequestPacket.submission.path}`,
      `identityProductionEvidenceResponseSchema=${identityRequestPacket.submission.responseSchema}`,
      `identityResponseAuditHeaders=${identityRequestPacket.submission.responseAuditHeaders.join("|")}`,
      `identityReceiptArchivePolicy=${identityRequestPacket.submission.receiptArchivePolicy.required ? "required" : "optional"};digestHeader=${identityRequestPacket.submission.receiptArchivePolicy.digestHeader};stableDigestHeader=${identityRequestPacket.submission.receiptArchivePolicy.stableSubmissionDigestHeader};bodyPaths=${identityRequestPacket.submission.receiptArchivePolicy.archiveBodyPaths.join("|")}`,
      `identityReceiptArchiveManifest=${identityReceiptArchiveManifest.schemaVersion}`,
      `identityReceiptArchiveReadyForArchive=${identityReceiptArchiveManifest.summary.readyForArchive}`,
      `identityReceiptArchiveReview=${identityReceiptArchiveManifest.summary.reviewArchives}`,
      `identityReceiptArchiveMissingReceipts=${identityReceiptArchiveManifest.summary.missingReceipts}`,
      `identityReceiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(identityReceiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      `identityReceiptArchiveArtifactCompleteness=${formatIdentityReceiptArchiveArtifactCompletenessCounts(identityReceiptArchiveManifest.summary.artifactCompletenessCounts)}`,
      `identityProductionEvidenceRequiredAcceptedStatus=${identityRequestPacket.submission.requiredAcceptedStatus}`,
      `identityProductionEvidenceRequiredAcceptedBridge=${identityRequestPacket.submission.requiredAcceptedBridge}`,
      identityRequestPacketEvidence("evidenceUrlPolicy", "identityEvidenceUrlPolicy"),
      identityRequestPacketEvidence("evidenceUrlRequiredForProductionEvidence", "identityEvidenceUrlRequiredForProductionEvidence"),
      identityRequestPacketEvidence("evidenceUrlPath", "identityEvidenceUrlPath"),
      identityRequestPacketEvidence("evidenceUrlSecretCarriers", "identityEvidenceUrlSecretCarriers"),
      identityRequestPacketEvidence("evidenceUrlAllowedHosts", "identityEvidenceUrlAllowedHosts"),
      `identityEvidenceUrlHostBinding=${identityEvidenceUrlHostBinding.status}`,
      `identityEvidenceAllowedHostConfig=${identityEvidenceUrlHostBinding.allowedHostConfigStatus}`,
      `identityEvidenceAllowedHosts=${identityEvidenceUrlHostBinding.allowedHostCount}`,
      `identityEvidenceInvalidAllowedHosts=${identityEvidenceUrlHostBinding.invalidAllowedHostCount}`,
      identityRequestPacketEvidence("notesSecretCarriers", "identityNotesSecretCarriers"),
      identityRequestPacketEvidence("freeTextSecretCarriers", "identityFreeTextSecretCarriers"),
      identityRequestPacketEvidence("productionEvidenceVerifiedAt", "identityProductionEvidenceVerifiedAt"),
      identityRequestPacketEvidence("ownerRolePolicy", "identityOwnerRolePolicy"),
      identityRequestPacketEvidence("senaAppOrigin", "identitySenaAppOrigin"),
      identityRequestPacketEvidence("redaction", "identityRedaction")
    ].filter((evidence): evidence is string => Boolean(evidence));
  const capabilities = [
    capability({
      id: "auth-login-register-sso",
      objectiveArea: "真实登录/注册/SSO",
      label: "Real auth, registration, SSO, MFA, reset, and session management",
      status: authProductionEvidenceStatus,
      evidence: [
        "loginPage=/login",
        "registerPage=/register",
        "resetPage=/reset-password",
        ...(selfManagedEnterprise ? [
          "enterpriseDeploymentMode=self-managed",
          "institutionIdentityEvidence=not-applicable"
        ] : []),
        `idpProductionEvidence=${authProductionEvidenceStatus}`,
        `idpTenantApproval=${selfManagedEnterprise ? "not-applicable" : authIdpDecisionStatus}`,
        `ssoSecrets=${authSsoSecrets}`,
        `ssoPreflightStatus=${authSsoGovernanceStatus}`,
        `scimProvisioningOwner=${selfManagedEnterprise ? "not-applicable" : authProvisioningOwnerStatus}`,
        `provisioningToken=${authProvisioningReadinessStatus}`,
        `secretHardening=${authSecretHardeningStatus}`,
        `secretRotation=${authRotationFreshness.status}`,
        `rotationFreshness=${authRotationFreshness.status}`,
        `rotationExpired=${authRotationExpiredIds.join("|") || "none"}`,
        `cutoverChecklist=${authCutoverChecklist.status}`,
        `cutoverBlockers=${authCutoverChecklist.summary.blockingItems}`,
        `identityReceiptVerifier=idp:${authIdentityReceiptVerifierStatus.idp}|provisioning:${authIdentityReceiptVerifierStatus.provisioning}`,
        `latestReleaseGateIdentityEvidenceBindingDigest=${latestReleaseGateIdentitySnapshot?.evidenceBindingDigest ?? "missing"}`,
        `currentIdentityProductionEvidenceBindingDigest=${deployment.identityProductionHandoff.evidenceBindingDigest ?? "missing"}`,
        `identityProductionReleaseGateDigestBinding=${authIdentityReleaseGateDigestBinding}`,
        "identityProductionEvidence=sena-enterprise-identity-production-evidence/v1",
        ...authIdentitySubmissionGuardrailEvidence,
        `idpAcceptanceEvidence=tenant:${authIdpAcceptanceEvidence.tenant}|callback:${authIdpAcceptanceEvidence.callback}|providerSecrets:${authIdpAcceptanceEvidence.providerSecrets}|secretStoreReference:${authIdpAcceptanceEvidence.secretStoreReference}|secretRotation:${authIdpAcceptanceEvidence.secretRotation}|evidenceUrl:${authIdpAcceptanceEvidence.evidenceUrl}`,
        `scimAcceptanceEvidence=owner:${authProvisioningOwnerAcceptanceEvidence.owner}|scimOrIdp:${authProvisioningOwnerAcceptanceEvidence.scimOrIdp}|bearerTokenRotation:${authProvisioningOwnerAcceptanceEvidence.bearerTokenRotation}|lifecycleGuardrails:${authProvisioningOwnerAcceptanceEvidence.lifecycleGuardrails}|evidenceUrl:${authProvisioningOwnerAcceptanceEvidence.evidenceUrl}`,
        `ssoModes=${governance.auth.ssoModes.join("|") || "local"}`,
        `mfa=${governance.auth.mfa.enabledUsers}`,
        `sessionCookie=${governance.auth.sessionCookie}`,
        `passwordPolicy=${governance.auth.passwordPolicy.schemaVersion}/minLength:${governance.auth.passwordPolicy.minLength}`,
        "ssoPreflight=sena-enterprise-sso-preflight/v1",
        "passwordReset=sena-auth-password-reset/v1"
      ],
      endpoints: ["/api/auth/login", "/api/auth/register", "/api/auth/sso", "/api/auth/sso/callback", "/api/auth/sessions", "/api/auth/mfa", "/api/auth/password-reset"],
      requiredArtifacts: ["sena-enterprise-sso-preflight/v1", "sena-enterprise-session-list/v1", "sena-enterprise-mfa-status/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-security-posture/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-provisioning/v1", "sena-scim-provisioning-bridge/v1"],
      productionContractTestIds: ["enterprise-sso-preflight", "enterprise-account-security", "enterprise-session-list", "enterprise-provisioning-readiness", "enterprise-platform-decision-register-export", "enterprise-identity-production-evidence-export", "enterprise-ops-readiness-export"],
      remainingPlatformDecisions: Array.from(new Set(authRemainingPlatformDecisions)),
      nextAction: authProductionEvidenceStatus === "ready"
        ? selfManagedEnterprise
          ? "Keep self-managed auth, session, MFA, CSRF, and secret-hardening evidence in release checks."
          : "Keep institution IdP tenant approval, SSO preflight, SCIM ownership, and secret rotation in release checks."
        : selfManagedEnterprise
          ? authIdentityTechnicalReadinessAction ?? "Complete self-managed auth secret hardening before release."
        : !authIdentityReleaseGateDigestBindingCurrent
          ? "Record a fresh release gate review after the latest institution identity production evidence handoff changes."
        : authIdentityEvidenceUrlHostBindingAction ?? authIdentityTechnicalReadinessAction ?? authIdentityRequestAction ?? "Complete institution IdP tenant approval, configure SSO secrets, assign SCIM/IdP provisioning ownership, and document secret rotation before production rollout."
    }),
    capability({
      id: "rbac-team-collaboration",
      objectiveArea: "RBAC、团队空间、多用户协作",
      label: "Team RBAC, invitations, memberships, collaboration stream, comments, and presence",
      status: "ready",
      evidence: [
        `teams=${governance.counts.teams}`,
        `roles=${governance.rbac.roles.length}`,
        `permissions=${governance.rbac.permissions.length}`,
        `comments=${governance.counts.comments}`,
        `adjudications=${governance.counts.adjudications}`,
        "permissions=owner|pi|admin|coder|reviewer|viewer",
        "collaborationPubSub=sena-enterprise-collaboration-pubsub-delivery/v1"
      ],
      endpoints: ["/api/sena/team", "/api/sena/team/invitations", "/api/sena/team/memberships", "/api/sena/projects/[projectId]/collaboration", "/api/sena/projects/[projectId]/collaboration/stream"],
      requiredArtifacts: ["sena-team-state/v1", "sena-enterprise-collaboration-state/v1", "sena-enterprise-collaboration-pubsub-delivery/v1"],
      productionContractTestIds: ["enterprise-team-operations", "enterprise-collaboration-pubsub-delivery"],
      remainingPlatformDecisions: pending("native-collaboration-pubsub"),
      nextAction: "Keep team RBAC and collaboration SSE runnable; choose whether the signed pub/sub bridge remains acceptable for SaaS scale."
    }),
    capability({
      id: "server-persistence-database",
      objectiveArea: "服务端保存项目和数据库",
      label: "Server-side projects, revisions, optimistic concurrency, backups, restore, and database bridge",
      status: pending("native-managed-database").length > 0 ? "review" : "ready",
      evidence: [
        `projects=${governance.counts.projects}`,
        `analysisRuns=${governance.counts.analysisRuns}`,
        `backupStatus=${getEnterpriseOpsStatus().backup.status}`,
        "revisionRestore=append-only",
        "conflictProtection=currentVersion|expectedVersion",
        "databaseSync=sena-enterprise-database-sync/v1"
      ],
      endpoints: ["/api/sena/projects", "/api/sena/projects/[projectId]", "/api/sena/analyze", "/api/sena/governance/backup"],
      requiredArtifacts: ["sena-enterprise-project-list/v1", "sena-enterprise-analysis-run/v1", "sena-enterprise-backup/v1", "sena-enterprise-backup-restore/v1", "sena-enterprise-database-sync/v1"],
      productionContractTestIds: ["enterprise-governance-backup-export", "enterprise-governance-database-sync"],
      remainingPlatformDecisions: pending("native-managed-database"),
      nextAction: "Use the file-backed runtime for local/pilot handoff and resolve native managed database ownership before multi-instance SaaS rollout."
    }),
    capability({
      id: "sena-backend-apis",
      objectiveArea: "SENA 后端 API",
      label: "Projects, uploads, import, analysis, validation, reliability, publication, docs, and ops APIs",
      status: "ready",
      evidence: [
        `serviceEndpoints=${deployment.serviceEndpoints.length}`,
        "docsApi=/api/sena/docs",
        "openapi=3.1.0",
        "opsApi=status|metrics|readiness|deployment|alerts|release-gate|go-live"
      ],
      endpoints: ["/api/sena/projects", "/api/sena/uploads", "/api/sena/import", "/api/sena/analyze", "/api/sena/reliability", "/api/sena/validation/group-comparison", "/api/sena/validation/expert-review", "/api/sena/exports/publication", "/api/sena/docs"],
      requiredArtifacts: ["sena-api-documentation/v1", "sena-enterprise-organization-deployment/v1"],
      productionContractTestIds: ["enterprise-ops-exports", "enterprise-upload-storage"],
      remainingPlatformDecisions: [],
      nextAction: "Keep API docs and OpenAPI output in sync with enterprise endpoint additions."
    }),
    capability({
      id: "data-import-adapters",
      objectiveArea: "更广的数据导入适配",
      label: "CSV, JSON, Excel, LMS/forum exports, transcript cleaning, upload scanning, and cleaning manifests",
      status: "ready",
      evidence: [
        `uploads=${governance.counts.uploads}`,
        `importRuns=${governance.counts.importRuns}`,
        "profiles=csv|json|xlsx|lms-forum|txt|md|srt|vtt",
        "cleaningManifest=sena-import-cleaning-manifest/v1",
        "uploadScan=DLP|checksum|object-storage-delivery"
      ],
      endpoints: ["/api/sena/import", "/api/sena/uploads"],
      requiredArtifacts: ["sena-import-cleaning-manifest/v1", "sena-upload-list/v1", "sena-enterprise-upload-storage-verification/v1"],
      productionContractTestIds: ["enterprise-import-cleaning-manifest-export", "enterprise-upload-storage-file-input"],
      remainingPlatformDecisions: pending("native-managed-object-storage"),
      nextAction: "Keep cleaning manifests attached to imported projects and decide whether to replace the signed object-storage bridge."
    }),
    capability({
      id: "multicoder-reliability",
      objectiveArea: "正式多编码者可靠性流程",
      label: "Multi-coder reliability import, kappa/alpha dashboard, reviewer sign-off, and adjudication history",
      status: "ready",
      evidence: [
        `reliabilityRuns=${governance.counts.reliabilityRuns}`,
        "jsonRequest=sena-reliability-json-request/v1",
        "metrics=CohenKappa|KrippendorffAlpha",
        "adjudicationCoverage=sena-reliability-adjudication-coverage/v1",
        "dashboard=sena-reliability-dashboard/v1"
      ],
      endpoints: ["/api/sena/reliability"],
      requiredArtifacts: ["sena-reliability-dashboard/v1", "sena-reliability-adjudication-coverage/v1"],
      productionContractTestIds: ["coding-reliability-gate", "export-reliability-dashboard"],
      remainingPlatformDecisions: [],
      nextAction: "Keep reviewer approval and adjudication coverage attached before research claims are marked claim-ready."
    }),
    capability({
      id: "research-validation-inference",
      objectiveArea: "研究验证和统计推断",
      label: "Preregistered group-comparison validation, Holm suites, rENA/R sna parity, walkthrough, and expert review",
      status: "ready",
      evidence: [
        `validationRuns=${governance.counts.validationRuns}`,
        "parityEvidence=sena-validation-parity-evidence/v1",
        "preregistration=sena-validation-preregistration-plan/v1",
        "formalInference=sena-formal-inference-readiness/v1",
        "claimPackage=sena-enterprise-claim-evidence-package/v1",
        "expertReview=sena-enterprise-expert-review/v1"
      ],
      endpoints: ["/api/sena/validation/group-comparison", "/api/sena/validation/expert-review", "/api/sena/validation/claim-package"],
      requiredArtifacts: ["sena-validation-parity-evidence/v1", "sena-validation-preregistration-plan/v1", "sena-formal-inference-readiness/v1", "sena-enterprise-expert-review/v1", "sena-enterprise-claim-evidence-package/v1"],
      productionContractTestIds: ["enterprise-validation-parity-evidence", "enterprise-validation-inference-reference", "enterprise-formal-inference-readiness", "enterprise-expert-review-dossier-export"],
      remainingPlatformDecisions: [],
      nextAction: "Keep formal validation evidence scoped to exploratory or claim-ready-with-limits decisions."
    }),
    capability({
      id: "publication-exports",
      objectiveArea: "出版级导出",
      label: "Publication SVG, PNG, HTML, XLSX, DOCX, PDF, package, source snapshot, and verification certificate",
      status: "ready",
      evidence: [
        "formats=svg|png|html|xlsx|docx|pdf|package",
        "xlsxWorkbookEvidence=claim-readiness|coding-reliability|data-governance|matrix-fingerprints|evidence-snippets",
        "projectSource=projectId|snapshot",
        "package=sena-publication-package/v1",
        "sourceSnapshot=sena-publication-source-snapshot/v1",
        "certificate=sena-publication-verification-certificate/v1"
      ],
      endpoints: ["/api/sena/exports/publication"],
      requiredArtifacts: ["sena-publication-package/v1", "sena-publication-source-snapshot/v1", "sena-publication-verification-certificate/v1", "sena-data-governance-metadata/v1"],
      productionContractTestIds: ["export-publication-svg", "export-publication-png", "export-publication-xlsx", "export-publication-docx", "export-publication-pdf", "export-publication-package"],
      remainingPlatformDecisions: [],
      nextAction: "Keep data-governance metadata and verification certificate bundled with publication exports."
    }),
    capability({
      id: "production-security-governance",
      objectiveArea: "生产部署、安全和治理",
      label: "Security posture, audit retention, alerts, backups, deployment package, native adapters, SaaS operations, and platform decisions",
      status: readiness.status === "blocked" || deployment.status === "blocked" ? "blocked" : security.status === "ready" ? "ready" : "review",
      evidence: [
        `deploymentStatus=${deployment.status}`,
        `readinessStatus=${readiness.status}`,
        `securityStatus=${security.status}`,
        `platformDecisions=${deployment.platformDecisionRegister.summary.decisions}`,
        `productionBlocking=${deployment.platformDecisionRegister.summary.productionBlocking}`,
        `idpProductionEvidence=${authProductionEvidenceStatus}`,
        `identityReceiptVerifier=idp:${authIdentityReceiptVerifierStatus.idp}|provisioning:${authIdentityReceiptVerifierStatus.provisioning}`,
        `cutoverChecklist=${authCutoverChecklist.status}`,
        `cutoverBlockers=${authCutoverChecklist.summary.blockingItems}`,
        "securityPosture=sena-enterprise-security-posture/v1",
        "deploymentPackage=sena-enterprise-organization-deployment/v1",
        "alertingEscalation=sena-enterprise-ops-alert-webhook/v1"
      ],
      endpoints: ["/api/sena/governance/health", "/api/sena/governance/security", "/api/sena/governance/audit", "/api/sena/governance/backup", "/api/sena/ops/readiness", "/api/sena/ops/deployment", "/api/sena/ops/native-adapters", "/api/sena/ops/saas-operations", "/api/sena/ops/platform-decisions", "/api/sena/ops/alerts"],
      requiredArtifacts: ["sena-enterprise-security-posture/v1", "sena-enterprise-governance/v1", "sena-enterprise-organization-deployment/v1", "sena-enterprise-native-adapter-certification/v1", "sena-enterprise-saas-operations-readiness/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-ops-alerts/v1"],
      productionContractTestIds: ["enterprise-governance-security-export", "enterprise-ops-readiness-export", "enterprise-ops-deployment-export", "enterprise-native-adapter-certification-export", "enterprise-saas-operations-readiness-export", "enterprise-ops-alerts-export", "enterprise-ops-alert-delivery"],
      remainingPlatformDecisions: pendingProductionBlockingPlatformDecisions("native-managed-database", "native-managed-object-storage", "native-collaboration-pubsub", "institution-idp-approval", "institution-provisioning-owner", "deployment-alerting-escalation", "institution-email-provider", "native-audit-siem-adapter", "native-managed-backup-storage", "full-saas-backend-operations"),
      nextAction: "Resolve or formally accept remaining platform-decision items before institution-wide SaaS rollout."
    }),
    capability({
      id: "go-live-operations",
      objectiveArea: "生产部署、安全和治理",
      label: "Go-live rehearsal, release gate draft, rollback drill, cutover attestation, and post-cutover monitor",
      status: goLiveRehearsal.status === "ready" && goLiveRehearsal.postCutoverMonitor.status === "ready" ? "ready" : "blocked",
      evidence: [
        `goLiveStatus=${goLiveRehearsal.status}`,
        `rollbackStatus=${goLiveRehearsal.rollbackDrill.status}`,
        `monitorStatus=${goLiveRehearsal.postCutoverMonitor.status}`,
        `releaseGateReviews=${goLiveRehearsal.summary.releaseGateReviews}`,
        `blockers=${goLiveRehearsal.summary.blockers.length}`,
        `idpProductionEvidence=${authProductionEvidenceStatus}`,
        `identityReceiptVerifier=idp:${authIdentityReceiptVerifierStatus.idp}|provisioning:${authIdentityReceiptVerifierStatus.provisioning}`,
        `cutoverChecklist=${authCutoverChecklist.status}`,
        `cutoverBlockers=${authCutoverChecklist.summary.blockingItems}`
      ],
      endpoints: ["/api/sena/ops/go-live-rehearsal", "/api/sena/ops/release-gate", "/api/sena/ops/alerts"],
      requiredArtifacts: ["sena-enterprise-go-live-rehearsal/v1", "sena-enterprise-release-gate-draft/v1", "sena-enterprise-go-live-rollback-drill/v1", "sena-enterprise-go-live-monitor/v1", "sena-enterprise-go-live-attestation/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1"],
      productionContractTestIds: ["enterprise-go-live-rehearsal-export", "enterprise-go-live-rollback-drill-export", "enterprise-go-live-monitor-export", "enterprise-go-live-attestation-submit", "enterprise-release-gate-review"],
      remainingPlatformDecisions: pendingProductionBlockingPlatformDecisions("native-managed-database", "native-managed-object-storage", "native-collaboration-pubsub", "institution-idp-approval", "institution-provisioning-owner", "deployment-alerting-escalation", "institution-email-provider", "native-audit-siem-adapter", "native-managed-backup-storage", "full-saas-backend-operations"),
      nextAction: goLiveRehearsal.status === "ready" ? "Keep post-cutover monitor evidence attached during the observation window." : "Resolve go-live rehearsal blockers before approving production cutover."
    })
  ];
  const summary = summarizeEnterpriseCapabilityAudit(capabilities);
  const nextActions = Array.from(new Set([
    summary.platformDecisionItems > 0 ? "Resolve or formally accept remaining platform-decision items before institution-wide SaaS rollout." : null,
    ...capabilities.filter((item) => item.status !== "ready").map((item) => item.nextAction)
  ].filter((action): action is string => Boolean(action))));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCapabilityAudit,
    generatedAt: now(),
    status: enterpriseCapabilityAuditStatus(capabilities),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    sourceObjective: {
      requestedCapabilityAreas: [
        "真实登录/注册/SSO",
        "RBAC、团队空间、多用户协作",
        "服务端保存项目和数据库",
        "SENA 后端 API",
        "更广的数据导入适配",
        "正式多编码者可靠性流程",
        "研究验证和统计推断",
        "出版级导出",
        "生产部署、安全和治理"
      ],
      interpretation: "Maps the original enterprise-readiness backlog to current runnable SENA endpoints, artifacts, UI contract checks, and remaining platform-decision ownership."
    },
    export: {
      api: "/api/sena/ops/capability-audit",
      filename: "sena-enterprise-capability-audit.json"
    },
    summary,
    capabilities,
    evidence: [
      "redaction=secret-values-excluded",
      "deploymentPackage=sena-enterprise-organization-deployment/v1",
      "readiness=sena-enterprise-deployment-readiness/v1",
      "governance=sena-enterprise-governance/v1",
      "security=sena-enterprise-security-posture/v1",
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      `capabilities=${summary.capabilities}`,
      `platformDecisionItems=${summary.platformDecisionItems}`
    ],
    nextActions
  };
}

function normalizeGoLiveChecklist(input: SenaEnterpriseGoLiveAttestationInput["checklist"]): SenaEnterpriseGoLiveChecklist {
  const checks = {
    rehearsalReviewed: Boolean(input.rehearsalReviewed),
    releaseGateDraftReviewed: Boolean(input.releaseGateDraftReviewed),
    verificationEvidenceReviewed: Boolean(input.verificationEvidenceReviewed),
    rollbackOwnerConfirmed: Boolean(input.rollbackOwnerConfirmed),
    platformOwnerDecisionReviewed: Boolean(input.platformOwnerDecisionReviewed)
  };
  const labels: Record<keyof typeof checks, string> = {
    rehearsalReviewed: "rehearsal-reviewed",
    releaseGateDraftReviewed: "release-gate-draft-reviewed",
    verificationEvidenceReviewed: "verification-evidence-reviewed",
    rollbackOwnerConfirmed: "rollback-owner-confirmed",
    platformOwnerDecisionReviewed: "platform-owner-decision-reviewed"
  };
  const missing = (Object.keys(checks) as Array<keyof typeof checks>)
    .filter((key) => !checks[key])
    .map((key) => labels[key]);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveChecklist,
    ...checks,
    passed: missing.length === 0,
    missing
  };
}

function summarizeGoLiveAttestations(attestations: SenaEnterpriseGoLiveAttestation[]): SenaEnterpriseGoLiveAttestationList["summary"] {
  return {
    total: attestations.length,
    approved: attestations.filter((attestation) => attestation.decision === "approved").length,
    conditional: attestations.filter((attestation) => attestation.decision === "conditional").length,
    blocked: attestations.filter((attestation) => attestation.decision === "blocked").length
  };
}

export function createEnterpriseGoLiveAttestation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseGoLiveAttestationInput
): SenaEnterpriseGoLiveAttestation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const decision = input.decision;
  if (!enterpriseReleaseGateDecisions.includes(decision)) {
    throw new SenaEnterpriseError("Go-live attestation decision is not recognized.", 400, "invalid_go_live_attestation_decision");
  }
  const checklist = normalizeGoLiveChecklist(input.checklist);
  const rehearsal = getEnterpriseGoLiveRehearsal({ teamId: input.teamId });
  if (decision === "approved" && rehearsal.status !== "ready") {
    throw new SenaEnterpriseError("Go-live attestation cannot be approved while the current rehearsal has blockers or review items.", 400, "go_live_attestation_approval_blocked");
  }
  if (decision === "approved" && rehearsal.postCutoverMonitor.status !== "ready") {
    throw new SenaEnterpriseError("Go-live attestation cannot be approved until the post-cutover monitor is ready.", 400, "go_live_attestation_post_cutover_monitor_required");
  }
  if (decision === "approved" && !checklist.passed) {
    throw new SenaEnterpriseError("Go-live attestation approval requires every checklist item to be confirmed.", 400, "go_live_attestation_checklist_required");
  }
  const identityProductionHandoffSnapshot = rehearsal.identityProductionHandoff;
  const latestReleaseGate = getEnterpriseOrganizationDeploymentPackage({ teamId: input.teamId }).releaseGate.latestReview;
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const identityProductionHandoffSnapshotEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = identityProductionHandoffSnapshot.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  const identityProductionHandoffSnapshotAuditEvidence = [
    identityProductionHandoffSnapshotEvidence("requestPacketPolicyHash", "identityProductionHandoffSnapshotRequestPacketPolicyHash"),
    identityProductionHandoffSnapshotEvidence("requestPacketPolicyBinding", "identityProductionHandoffSnapshotRequestPacketPolicyBinding"),
    identityProductionHandoffSnapshotEvidence("receiptReviewRequests", "identityProductionHandoffSnapshotReceiptReviewRequests"),
    identityProductionHandoffSnapshotEvidence("evidenceUrlAllowedHosts", "identityProductionHandoffSnapshotEvidenceUrlAllowedHosts")
  ].filter((evidence): evidence is string => Boolean(evidence));
  const identityProductionHandoffSnapshotHostBinding = identityProductionHandoffSnapshot.evidenceUrlHostBinding;
  const latestReleaseGateIdentityReceiptArchiveDecisions = identityReceiptArchiveDecisionAuditSummaries(latestReleaseGateIdentitySnapshot);
  const timestamp = now();
  const attestation: SenaEnterpriseGoLiveAttestation = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation,
    id: id("go-live"),
    teamId: input.teamId,
    environment: requiredReleaseGateText(input.environment, "environment"),
    releaseVersion: requiredReleaseGateText(input.releaseVersion, "releaseVersion"),
    decision,
    status: decision,
    attesterName: requiredReleaseGateText(input.attesterName, "attesterName"),
    attesterRole: requiredReleaseGateText(input.attesterRole, "attesterRole"),
    notes: requiredReleaseGateText(input.notes, "notes"),
    checklist,
    goLiveRehearsalSnapshot: {
      schemaVersion: rehearsal.schemaVersion,
      generatedAt: rehearsal.generatedAt,
      status: rehearsal.status,
      blockers: rehearsal.summary.blockers
    },
    releaseGateDraftSnapshot: {
      schemaVersion: rehearsal.releaseGateDraft.schemaVersion,
      decision: rehearsal.releaseGateDraft.decision,
      verificationStatus: rehearsal.releaseGateDraft.verificationEvidence.status
    },
    identityProductionHandoffSnapshot,
    latestReleaseGateSnapshot: latestReleaseGate ? {
      schemaVersion: latestReleaseGate.schemaVersion,
      id: latestReleaseGate.id,
      decision: latestReleaseGate.decision,
      verificationStatus: latestReleaseGate.verificationEvidence.status,
      ...(latestReleaseGateIdentitySnapshot ? {
        identityProductionStatus: latestReleaseGateIdentitySnapshot.status,
        identityProductionEvidenceDigest: latestReleaseGateIdentitySnapshot.dossierDigest ?? "missing",
        identityReceiptArchiveManifestDigest: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
        identityReceiptArchiveReadyForArchive: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.readyForArchive,
        identityReceiptArchiveReview: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.reviewArchives,
        identityReceiptArchiveMissingReceipts: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingReceipts,
        identityReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
        identityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot),
        identityReceiptArchiveDecisions: latestReleaseGateIdentityReceiptArchiveDecisions,
        identityReleaseGateBlocked: latestReleaseGateIdentitySnapshot.releaseGateBlocked,
        identitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot.submissionVerifier.incompleteDecisions,
        identitySubmissionVerifierMissing: latestReleaseGateIdentitySnapshot.submissionVerifier.missingProductionEvidence,
        identitySubmissionVerifierMissingTechnical: latestReleaseGateIdentitySnapshot.submissionVerifier.missingTechnicalPrerequisites,
        identityRotationFreshness: latestReleaseGateIdentitySnapshot.rotationFreshness.status,
        identityEvidenceUrlHostBinding: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.status,
        identityEvidenceAllowedHostConfig: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.allowedHostConfigStatus,
        identityEvidenceAllowedHosts: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.allowedHostCount,
        identityEvidenceInvalidAllowedHosts: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.invalidAllowedHostCount,
        identityCutoverChecklistStatus: latestReleaseGateIdentitySnapshot.cutoverChecklist.status,
        identityCutoverChecklistBlockingItems: latestReleaseGateIdentitySnapshot.cutoverChecklist.summary.blockingItems
      } : {})
    } : undefined,
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateDraft=sena-enterprise-release-gate-draft/v1",
      "rollbackDrill=sena-enterprise-go-live-rollback-drill/v1",
      "postCutoverMonitor=sena-enterprise-go-live-monitor/v1",
      "checklist=sena-enterprise-go-live-checklist/v1",
      `decision=${decision}`,
      `rehearsalStatus=${rehearsal.status}`,
      `blockers=${rehearsal.summary.blockers.length}`,
      `checklistPassed=${checklist.passed ? "yes" : "no"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestReleaseGateIdentityProductionEvidenceDigest=${latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveManifestDigest=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveReadyForArchive=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.readyForArchive ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveReview=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.reviewArchives ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveMissingReceipts=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.missingReceipts ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveMissingInputs=${latestReleaseGateIdentitySnapshot ? formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts) : "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveArtifactCompleteness=${latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot)}`,
      `latestReleaseGateIdentityEvidenceHostBinding=${latestReleaseGateIdentitySnapshot?.evidenceUrlHostBinding.status ?? "missing"}`,
      `identityProductionHandoffSnapshot=${identityProductionHandoffSnapshot.schemaVersion}`,
      `identityProductionHandoffSnapshotStatus=${identityProductionHandoffSnapshot.status}`,
      `identityProductionHandoffSnapshotMissingEvidence=${identityProductionHandoffSnapshot.evidenceManifest.missingEvidenceIds.length}`,
      `identityProductionHandoffSnapshotRequestBlockers=${identityProductionHandoffSnapshot.platformRequestPacket.summary.blockingRequests}`,
      `identityProductionHandoffSnapshotDigest=${identityProductionHandoffSnapshot.dossierDigest ?? "missing"}`,
      `identityProductionHandoffSnapshotReceiptArchiveManifestDigest=${identityProductionHandoffSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `identityProductionHandoffSnapshotReceiptArchiveReadyForArchive=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.readyForArchive}`,
      `identityProductionHandoffSnapshotReceiptArchiveReview=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.reviewArchives}`,
      `identityProductionHandoffSnapshotReceiptArchiveMissingReceipts=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingReceipts}`,
      `identityProductionHandoffSnapshotReceiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      ...identityProductionHandoffSnapshotAuditEvidence,
      `identityProductionHandoffSnapshotHostBinding=${identityProductionHandoffSnapshotHostBinding.status}`,
      `identityProductionHandoffSnapshotAllowedHostConfig=${identityProductionHandoffSnapshotHostBinding.allowedHostConfigStatus}`,
      `identityProductionHandoffSnapshotAllowedHosts=${identityProductionHandoffSnapshotHostBinding.allowedHostCount}`,
      `identityProductionHandoffSnapshotInvalidAllowedHosts=${identityProductionHandoffSnapshotHostBinding.invalidAllowedHostCount}`
    ],
    createdByUserId: context.user.id,
    createdAt: timestamp
  };

  const db = readEnterpriseDb();
  db.goLiveAttestations.unshift(attestation);
  db.goLiveAttestations = db.goLiveAttestations.slice(0, 1000);
  appendAudit(db, {
    event: "ops.go_live.attestation",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      goLiveAttestationId: attestation.id,
      decision: attestation.decision,
      environment: attestation.environment,
      releaseVersion: attestation.releaseVersion,
      rehearsalStatus: attestation.goLiveRehearsalSnapshot.status,
      blockers: attestation.goLiveRehearsalSnapshot.blockers.length,
      checklistPassed: attestation.checklist.passed,
      latestReleaseGateIdentityProductionStatus: latestReleaseGateIdentitySnapshot?.status ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierMissing: latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierMissingTechnical: latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing",
      latestReleaseGateIdentityRotationFreshness: latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing",
      latestReleaseGateIdentityCutoverChecklistStatus: latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing",
      latestReleaseGateIdentityCutoverChecklistBlockingItems: latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing",
      latestReleaseGateIdentityProductionEvidenceDigest: latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing",
      latestReleaseGateIdentityReceiptArchiveManifestDigest: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      latestReleaseGateIdentityReceiptArchiveReadyForArchive: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.readyForArchive ?? "missing",
      latestReleaseGateIdentityReceiptArchiveReview: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.reviewArchives ?? "missing",
      latestReleaseGateIdentityReceiptArchiveMissingReceipts: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.missingReceipts ?? "missing",
      latestReleaseGateIdentityReceiptArchiveMissingInputs: latestReleaseGateIdentitySnapshot ? formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts) : "missing",
      latestReleaseGateIdentityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot),
      latestReleaseGateIdentityReceiptArchiveDecisions: JSON.stringify(latestReleaseGateIdentityReceiptArchiveDecisions ?? []),
      latestReleaseGateIdentityEvidenceHostBinding: latestReleaseGateIdentitySnapshot?.evidenceUrlHostBinding.status ?? "missing",
      identityProductionHandoffSnapshotStatus: identityProductionHandoffSnapshot.status,
      identityProductionHandoffSnapshotMissingEvidence: identityProductionHandoffSnapshot.evidenceManifest.missingEvidenceIds.length,
      identityProductionHandoffSnapshotRequestBlockers: identityProductionHandoffSnapshot.platformRequestPacket.summary.blockingRequests,
      identityProductionHandoffSnapshotDigest: identityProductionHandoffSnapshot.dossierDigest ?? "missing",
      identityProductionHandoffSnapshotReceiptArchiveManifestDigest: identityProductionHandoffSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      identityProductionHandoffSnapshotReceiptArchiveReadyForArchive: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.readyForArchive,
      identityProductionHandoffSnapshotReceiptArchiveReview: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.reviewArchives,
      identityProductionHandoffSnapshotReceiptArchiveMissingReceipts: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingReceipts,
      identityProductionHandoffSnapshotReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
      identityProductionHandoffSnapshotReceiptReviewRequests: identityProductionHandoffSnapshot.platformRequestPacket.summary.receiptReviewRequests,
      identityProductionHandoffSnapshotEvidenceUrlAllowedHosts: identityProductionHandoffSnapshot.platformRequestPacket.evidence
        .find((item) => item.startsWith("evidenceUrlAllowedHosts="))?.slice("evidenceUrlAllowedHosts=".length) ?? "missing",
      identityProductionHandoffSnapshotHostBinding: identityProductionHandoffSnapshotHostBinding.status,
      identityProductionHandoffSnapshotAllowedHostConfig: identityProductionHandoffSnapshotHostBinding.allowedHostConfigStatus,
      identityProductionHandoffSnapshotAllowedHosts: identityProductionHandoffSnapshotHostBinding.allowedHostCount,
      identityProductionHandoffSnapshotInvalidAllowedHosts: identityProductionHandoffSnapshotHostBinding.invalidAllowedHostCount
    }
  });
  writeEnterpriseDb(db);
  return attestation;
}

export function listEnterpriseGoLiveAttestations(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseGoLiveAttestationList {
  const managedTeamIds = context.memberships
    .filter((membership) => membership.status === "active" && (membership.role === "owner" || membership.role === "pi" || membership.role === "admin"))
    .map((membership) => membership.teamId);
  const scopeTeamIds = input.teamId ? [input.teamId] : managedTeamIds;
  for (const teamId of scopeTeamIds) {
    requireEnterprisePermission(context, teamId, "team:manage");
  }
  const attestations = (readEnterpriseDb().goLiveAttestations ?? [])
    .filter((attestation) => scopeTeamIds.includes(attestation.teamId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestations,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizeGoLiveAttestations(attestations),
    attestations
  };
}

export function getEnterpriseOrganizationDeploymentPackage(input: { teamId?: string } = {}): SenaEnterpriseOrganizationDeploymentPackage {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const db = readEnterpriseDb();
  const readiness = getEnterpriseDeploymentReadiness();
  const governance = getEnterpriseGovernanceStatus();
  const opsStatus = getEnterpriseOpsStatus();
  const postgresConfig = resolveEnterprisePostgresConfig();
  const baseUrl = normalizedBaseUrl();
  const webhookProvider = notificationWebhookProvider();
  const emailProvider = emailWebhookProvider();
  const collaborationProvider = collaborationPubSubProvider();
  const databaseSyncProvider = databaseSyncWebhookProvider();
  const objectStorageProvider = objectStorageWebhookProvider();
  const backupProvider = backupWebhookProvider();
  const alertProvider = alertWebhookProvider();
  const auditProvider = auditWebhookProvider();
  const oidcProviders = getEnterpriseSsoProviderStatuses();
  const governanceCheckById = new Map(governance.checks.map((check) => [check.id, check]));
  const mfaKeyConfigured = Boolean(envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET"));
  const fullSaasBackendApproved = envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED") === "1";
  const identityEvidenceHostAllowlist = identityEvidenceAllowedHostConfig();
  const identityEvidenceHostAllowlistConfigured = identityEvidenceHostAllowlist.configured &&
    identityEvidenceHostAllowlist.hosts.length > 0 &&
    identityEvidenceHostAllowlist.invalidCount === 0;
  const env: SenaEnterpriseOrganizationDeploymentEnv[] = [
    deploymentEnv({
      name: "SENA_APP_URL",
      category: "runtime",
      required: true,
      configured: Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")),
      secret: false,
      value: baseUrl,
      purpose: "Canonical deployment origin for OAuth/OIDC callbacks and email action URLs"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_DB_DIR",
      category: "storage",
      required: true,
      configured: opsStatus.storage.configuredDirectory === "env-configured",
      secret: false,
      value: process.env.SENA_ENTERPRISE_DB_DIR,
      purpose: "Managed durable enterprise data directory"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS",
      category: "storage",
      required: false,
      configured: Boolean(envValue("SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS")),
      secret: false,
      defaultedTo: String(dbLockTimeoutMs),
      purpose: "Single-runtime file-lock timeout"
    }),
    deploymentEnv({
      name: "SENA_MFA_ENCRYPTION_KEY|SENA_SESSION_SECRET",
      category: "auth",
      required: true,
      configured: mfaKeyConfigured,
      secret: true,
      purpose: "Production auth/MFA secret material"
    }),
    deploymentEnv({
      name: "SENA_OPS_TOKEN",
      category: "ops",
      required: true,
      configured: opsStatus.deployment.opsTokenConfigured,
      secret: true,
      purpose: "Bearer token for deployment monitors"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN",
      category: "provisioning",
      required: !selfManagedEnterprise,
      configured: selfManagedEnterprise || opsStatus.deployment.provisioningTokenConfigured,
      secret: true,
      purpose: selfManagedEnterprise
        ? "Not required for self-managed manual local membership and RBAC administration"
        : "Bearer token for institution IdP/SCIM provisioning"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN_SECRET_REF",
      category: "provisioning",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF").configured,
      secret: false,
      value: envValue("SENA_PROVISIONING_TOKEN_SECRET_REF"),
      purpose: "Non-secret institution secret-store reference for provisioning bearer-token custody evidence"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN_VERSION",
      category: "provisioning",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: Boolean(envValue("SENA_PROVISIONING_TOKEN_VERSION")),
      secret: false,
      value: envValue("SENA_PROVISIONING_TOKEN_VERSION"),
      purpose: "Non-secret provisioning bearer-token rotation version used to bind institution production evidence"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identityEvidenceHostAllowlistConfigured,
      secret: false,
      purpose: "Institution evidence-host allowlist for IdP/SCIM production evidence URLs"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identitySecretRotationCadenceBinding().valid,
      secret: false,
      value: envValue("SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"),
      purpose: "Institution-approved SSO client-secret and provisioning bearer-token rotation cadence in days"
    }),
    deploymentEnv({
      name: "SENA_SSO_INSTITUTION_TENANT_ID",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: idpTenantBinding().configured,
      secret: false,
      value: envValue("SENA_SSO_INSTITUTION_TENANT_ID"),
      purpose: "Non-secret institution IdP tenant or app-registration identifier used to bind tenant approval evidence"
    }),
    deploymentEnv({
      name: "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF").configured,
      secret: false,
      value: envValue("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"),
      purpose: "Non-secret institution secret-store reference for OIDC client-secret custody evidence"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_LIFECYCLE_OWNER_MODE",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identityLifecycleOwnerModeBinding().valid,
      secret: false,
      value: envValue("SENA_IDENTITY_LIFECYCLE_OWNER_MODE"),
      purpose: "Institution lifecycle ownership mode for SCIM, IdP, or hybrid provisioning"
    }),
    deploymentEnv({
      name: "SENA_AUDIT_RETENTION_DAYS",
      category: "governance",
      required: true,
      configured: Boolean(envValue("SENA_AUDIT_RETENTION_DAYS")),
      secret: false,
      value: envValue("SENA_AUDIT_RETENTION_DAYS"),
      purpose: "Institution-approved audit retention window"
    }),
    deploymentEnv({
      name: "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
      category: "governance",
      required: false,
      configured: fullSaasBackendApproved,
      secret: false,
      value: envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"),
      purpose: "Institution platform-owner approval for the full SaaS backend operating model"
    }),
    ...deploymentWebhookEnv("SENA_NOTIFICATION_WEBHOOK_URL", "SENA_NOTIFICATION_WEBHOOK_SECRET", webhookProvider, "notifications", "Notification event bridge"),
    ...deploymentWebhookEnv("SENA_EMAIL_WEBHOOK_URL", "SENA_EMAIL_WEBHOOK_SECRET", emailProvider, "notifications", "Institution email bridge"),
    ...deploymentWebhookEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL", "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET", collaborationProvider, "collaboration", "Collaboration pub/sub bridge"),
    ...deploymentWebhookEnv("SENA_DATABASE_SYNC_WEBHOOK_URL", "SENA_DATABASE_SYNC_WEBHOOK_SECRET", databaseSyncProvider, "storage", "Managed database sync bridge"),
    ...deploymentWebhookEnv("SENA_OBJECT_STORAGE_WEBHOOK_URL", "SENA_OBJECT_STORAGE_WEBHOOK_SECRET", objectStorageProvider, "uploads", "Managed upload object-storage bridge"),
    ...deploymentWebhookEnv("SENA_BACKUP_WEBHOOK_URL", "SENA_BACKUP_WEBHOOK_SECRET", backupProvider, "governance", "Managed backup delivery bridge"),
    ...deploymentWebhookEnv("SENA_ALERT_WEBHOOK_URL", "SENA_ALERT_WEBHOOK_SECRET", alertProvider, "ops", "Deployment alert delivery bridge"),
    ...deploymentWebhookEnv("SENA_AUDIT_WEBHOOK_URL", "SENA_AUDIT_WEBHOOK_SECRET", auditProvider, "governance", "Audit/SIEM forwarding bridge")
  ];

  for (const provider of oidcProviders) {
    const prefix = providerEnvPrefix(provider.provider);
    env.push(
      deploymentEnv({
        name: `${prefix}_CLIENT_ID`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(envValue(`${prefix}_CLIENT_ID`)),
        value: envValue(`${prefix}_CLIENT_ID`),
        purpose: `${provider.provider} OAuth/OIDC client identifier`
      }),
      deploymentEnv({
        name: `${prefix}_CLIENT_SECRET`,
        category: "sso",
        required: false,
        secret: true,
        configured: Boolean(envValue(`${prefix}_CLIENT_SECRET`)),
        purpose: `${provider.provider} OAuth/OIDC client secret`
      }),
      deploymentEnv({
        name: `${prefix}_CLIENT_SECRET_VERSION`,
        category: "sso",
        required: !selfManagedEnterprise && provider.provider === "institution" && process.env.NODE_ENV === "production",
        secret: false,
        configured: Boolean(envValue(`${prefix}_CLIENT_SECRET_VERSION`)),
        value: envValue(`${prefix}_CLIENT_SECRET_VERSION`),
        purpose: `${provider.provider} non-secret OAuth/OIDC client-secret rotation version used to bind institution production evidence`
      }),
      deploymentEnv({
        name: `${prefix}_DISCOVERY_URL`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.discoveryUrl),
        endpointHash: sha256Text(provider.discoveryUrl),
        purpose: `${provider.provider} OAuth/OIDC discovery endpoint`
      }),
      deploymentEnv({
        name: `${prefix}_ISSUER`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.issuer),
        endpointHash: sha256Text(provider.issuer),
        purpose: `${provider.provider} OIDC issuer claim for id_token validation`
      }),
      deploymentEnv({
        name: `${prefix}_JWKS_URL`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.jwksUrl),
        endpointHash: sha256Text(provider.jwksUrl),
        purpose: `${provider.provider} JWKS endpoint for id_token signature validation`
      })
    );
  }

  const requiredEnv = env.filter((entry) => entry.required);
  const missingRequiredEnv = requiredEnv.filter((entry) => entry.status === "review").map((entry) => entry.name);
  const webhookBridgeProviders = [
    webhookProvider,
    emailProvider,
    collaborationProvider,
    databaseSyncProvider,
    objectStorageProvider,
    backupProvider,
    alertProvider,
    auditProvider
  ];
  const keyCheckIds = [
    "auth-session",
    "oauth-oidc-sso",
    "organization-provisioning",
    "persistence",
    "database-sync-bridge",
    "backup-restore-rehearsal",
    "deployment-monitoring",
    "organization-deployment-package",
    "release-gate-review",
    "notification-delivery",
    "institution-email-delivery",
    "audit-log"
  ];
  const keyChecks = keyCheckIds
    .map((id) => governanceCheckById.get(id))
    .filter((check): check is SenaEnterpriseGovernanceCheck => Boolean(check))
    .map((check) => ({
      id: check.id,
      status: check.status,
      evidence: check.evidence,
      nextAction: check.nextAction
    }));
  const oidcGovernance = governanceCheckById.get("oauth-oidc-sso");
  const provisioningGovernance = governanceCheckById.get("organization-provisioning");
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const latestDecisionAcceptances = latestPlatformDecisionAcceptances(platformDecisionAcceptances);
  const fullSaasDecisionAcceptance = latestDecisionAcceptances.get("full-saas-backend-operations");
  const fullSaasDecisionAccepted = fullSaasDecisionAcceptance?.status === "accepted" && fullSaasDecisionAcceptance.acceptedBridge;
  const platformDecisionAcceptanceSummary = summarizePlatformDecisionAcceptances(platformDecisionAcceptances);
  const alertingReady = Boolean(alertingOwner()) && alertProvider.configured && alertProvider.secretConfigured;
  const managedDatabaseReady = postgresConfig.configured || (databaseSyncProvider.configured && databaseSyncProvider.secretConfigured);
  const fullSaasBackendReady = fullSaasBackendApproved &&
    Boolean(fullSaasDecisionAccepted) &&
    managedDatabaseReady &&
    objectStorageProvider.configured &&
    objectStorageProvider.secretConfigured &&
    collaborationProvider.configured &&
    collaborationProvider.secretConfigured &&
    backupProvider.configured &&
    backupProvider.secretConfigured &&
    alertingReady &&
    auditProvider.configured &&
    auditProvider.secretConfigured &&
    emailProvider.configured &&
    emailProvider.secretConfigured &&
    oidcGovernance?.status === "pass" &&
    provisioningGovernance?.status === "pass";
  const decisions: SenaEnterpriseOrganizationDeploymentDecision[] = [
    {
      id: "native-managed-database",
      label: "Native managed database adapter ownership",
      status: postgresConfig.configured
        ? "ready"
        : databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: postgresConfig.configured
        ? [
          `current=${enterprisePostgresStorageEngine(postgresConfig)}`,
          "native=sena-enterprise-postgres-adapter/v1",
          ...enterprisePostgresPublicEvidence(postgresConfig)
        ]
        : [
          "current=file-backed-json",
          "bridge=sena-enterprise-database-sync-webhook/v1",
          `endpointHash=${databaseSyncProvider.endpointHash ?? "none"}`
        ],
      nextAction: postgresConfig.configured
        ? "Run and attach live Neon/Postgres adapter verification before multi-instance SaaS cutover."
        : databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
          ? "Platform owner must decide whether the signed sync bridge is acceptable or replace it with a native database adapter before SaaS scale."
          : "Choose a managed database/durable volume owner and configure the signed sync bridge as interim evidence."
    },
    {
      id: "native-managed-object-storage",
      label: "Native managed object storage ownership",
      status: objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=private-local-upload-directory",
        "bridge=sena-enterprise-upload-object-storage-webhook/v1",
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Platform owner must decide whether the signed object-storage bridge is acceptable or replace it with a native object-storage adapter."
        : "Configure managed object storage and scan/retention ownership before regulated deployment."
    },
    {
      id: "native-collaboration-pubsub",
      label: "Native collaboration pub/sub ownership",
      status: collaborationProvider.configured && collaborationProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=single-runtime-sse-plus-webhook-queue",
        "bridge=sena-enterprise-collaboration-pubsub-webhook/v1",
        `endpointHash=${collaborationProvider.endpointHash ?? "none"}`
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured
        ? "Platform owner must decide whether the signed pub/sub bridge is acceptable or replace it with a native bus adapter before multi-instance scale."
        : "Choose the institution event bus and configure collaboration delivery before multi-runtime collaboration is claimed."
    },
    {
      id: "institution-idp-approval",
      label: "Institution IdP tenant and callback approval",
      status: oidcGovernance?.status === "pass" ? "ready" : "open",
      evidence: oidcGovernance?.evidence ?? ["oauthGovernance=missing"],
      nextAction: oidcGovernance?.status === "pass"
        ? "Keep provider-side redirect URI approval and SSO preflight in release checks."
        : "Complete IdP tenant approval, configure OAuth/OIDC secrets, and rerun SSO preflight."
    },
    {
      id: "institution-provisioning-owner",
      label: "Institution provisioning owner",
      status: provisioningGovernance?.status === "pass" ? "ready" : "open",
      evidence: provisioningGovernance?.evidence ?? ["provisioningGovernance=missing"],
      nextAction: provisioningGovernance?.status === "pass"
        ? "Map provisioning ownership to the institution IdP or SCIM bridge."
        : "Assign the institution provisioning owner and configure SENA_PROVISIONING_TOKEN."
    },
    {
      id: "deployment-alerting-escalation",
      label: "Deployment alerting escalation owner",
      status: alertingReady ? "ready" : "open",
      evidence: [
        `alertingOwner=${alertingOwner() ? "configured" : "missing"}`,
        `alertingChannel=${alertingChannel()}`,
        `alertWebhook=${alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${alertProvider.endpointHash ?? "none"}`
      ],
      nextAction: alertingReady
        ? "Connect signed alert delivery to deployment monitor escalation policy."
        : "Assign alert owner/channel/runbook and configure signed alert delivery."
    },
    {
      id: "native-audit-siem-adapter",
      label: "Native audit/SIEM retention ownership",
      status: auditProvider.configured && auditProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=append-only-file-audit-log-plus-signed-webhook",
        "bridge=sena-enterprise-audit-webhook/v1",
        `retentionDays=${auditRetentionWindowDays() ?? "missing"}`,
        `endpointHash=${auditProvider.endpointHash ?? "none"}`
      ],
      nextAction: auditProvider.configured && auditProvider.secretConfigured
        ? "Platform owner must decide whether the signed audit/SIEM bridge is acceptable or replace it with a native audit retention adapter."
        : "Configure signed audit/SIEM forwarding and retention ownership before production audit claims."
    },
    {
      id: "institution-email-provider",
      label: "Institution email provider ownership",
      status: emailProvider.configured && emailProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "bridge=sena-enterprise-email-webhook/v1",
        `endpointHash=${emailProvider.endpointHash ?? "none"}`,
        `passwordResetLocalTokenExposure=${passwordResetTokenExposure()}`
      ],
      nextAction: emailProvider.configured && emailProvider.secretConfigured
        ? "Institution owner must approve retention, replay, and deliverability policy for the signed email bridge."
        : "Configure institution email delivery before password reset or invitation email is claimed."
    },
    {
      id: "native-managed-backup-storage",
      label: "Native managed backup and restore ownership",
      status: backupProvider.configured && backupProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=team-scoped-file-backup-plus-signed-webhook",
        "bridge=sena-enterprise-backup-webhook/v1",
        "restoreRehearsal=sena-enterprise-backup-restore/v1",
        `endpointHash=${backupProvider.endpointHash ?? "none"}`
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Platform owner must decide whether the signed managed-backup bridge is acceptable or replace it with a native backup/restore adapter."
        : "Configure signed managed-backup delivery and restore ownership before production backup claims."
    },
    {
      id: "full-saas-backend-operations",
      label: "Full SaaS backend operating model",
      status: fullSaasBackendReady ? "ready" : selfManagedEnterprise ? "bridge-ready" : "open",
      evidence: [
        "current=file-backed-json|signed-webhook-bridges|single-runtime-sse",
        `saasOperatingModelApproved=${fullSaasBackendApproved ? "yes" : "no"}`,
        `managedDatabaseBridge=${databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `objectStorageBridge=${objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `collaborationPubSubBridge=${collaborationProvider.configured && collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `backupBridge=${backupProvider.configured && backupProvider.secretConfigured ? "configured" : "missing"}`,
        `alertingOwner=${alertingOwner() ? "configured" : "missing"}`,
        `alertWebhook=${alertProvider.configured && alertProvider.secretConfigured ? "configured" : "missing"}`,
        `auditWebhook=${auditProvider.configured && auditProvider.secretConfigured ? "configured" : "missing"}`,
        `emailWebhook=${emailProvider.configured && emailProvider.secretConfigured ? "configured" : "missing"}`,
        `idpApproval=${oidcGovernance?.status ?? "missing"}`,
        `provisioningOwner=${provisioningGovernance?.status ?? "missing"}`
      ],
      nextAction: fullSaasBackendReady
        ? "Keep the SaaS operating-model approval with release evidence and rerun deployment readiness before each institution handoff."
        : selfManagedEnterprise
          ? "Keep self-managed runtime, backup, audit, and release verification evidence current; full institution SaaS operating-model approval is not applicable for this deployment boundary."
        : "Approve the full SaaS backend operating model or replace the file-backed/runtime bridge controls with native managed platform adapters."
    }
  ];
  const platformDecisionRegister = buildEnterprisePlatformDecisionRegister(decisions, platformDecisionAcceptances);
  const nativeAdapterCertification = buildEnterpriseNativeAdapterCertification(platformDecisionRegister, platformDecisionAcceptances);
  const openPlatformDecisions = platformDecisionRegister.summary.open;
  const generatedAt = now();
  const identityProductionEvidence = enterpriseReleaseGateIdentityProductionSnapshot({
    generatedAt,
    teamId: input.teamId,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  const identityProductionHandoff = buildEnterpriseIdentityProductionEvidenceDossier({
    generatedAt,
    teamId: input.teamId,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  const releaseGateReviews = input.teamId
    ? (db.releaseGateReviews ?? []).filter((review) => review.teamId === input.teamId)
    : db.releaseGateReviews ?? [];
  const releaseGate = buildEnterpriseDeploymentReleaseGateEvidence(releaseGateReviews);
  const saasOperationsReadiness = buildEnterpriseSaasOperationsReadiness({
    platformDecisionRegister,
    nativeAdapterCertification,
    releaseGate,
    identityProductionHandoff,
    saasOperatingModelApproved: fullSaasBackendApproved
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment,
    generatedAt,
    status: readiness.status === "blocked" || missingRequiredEnv.length > 0 ? "blocked" : openPlatformDecisions > 0 || readiness.status === "review" || governance.status === "review" ? "review" : "ready",
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      secretHashingDisabled: true
    },
    baseUrl: {
      configured: Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")),
      origin: baseUrl,
      originHash: sha256Text(baseUrl)!,
      callbackPath: ssoCallbackPath
    },
    environment: {
      nodeEnv: opsStatus.deployment.nodeEnv,
      runtime: "nodejs",
      storageEngine: opsStatus.storage.engine,
      configuredDirectory: opsStatus.storage.configuredDirectory,
      pathHint: opsStatus.storage.pathHint
    },
    access: {
      api: "/api/sena/ops/deployment",
      auth: "ops-bearer-token-or-session",
      opsTokenConfigured: opsStatus.deployment.opsTokenConfigured
    },
    summary: {
      requiredEnv: requiredEnv.length,
      configuredRequiredEnv: requiredEnv.length - missingRequiredEnv.length,
      missingRequiredEnv,
      configuredSecrets: env.filter((entry) => entry.secret && entry.configured).length,
      configuredWebhookBridges: webhookBridgeProviders.filter((provider) => provider.configured && provider.secretConfigured).length,
      openPlatformDecisions,
      acceptedPlatformDecisions: platformDecisionAcceptanceSummary.accepted,
      identityProductionStatus: identityProductionEvidence.status,
      identitySubmissionVerifierIncomplete: identityProductionEvidence.submissionVerifier.incompleteDecisions,
      identityRotationFreshness: identityProductionEvidence.rotationFreshness.status,
      identityEvidenceUrlHostBinding: identityProductionEvidence.evidenceUrlHostBinding.status,
      identityEvidenceAllowedHostConfig: identityProductionEvidence.evidenceUrlHostBinding.allowedHostConfigStatus,
      identityEvidenceAllowedHosts: identityProductionEvidence.evidenceUrlHostBinding.allowedHostCount,
      identityEvidenceInvalidAllowedHosts: identityProductionEvidence.evidenceUrlHostBinding.invalidAllowedHostCount,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview
    },
    readiness: {
      schemaVersion: readiness.schemaVersion,
      status: readiness.status,
      blockers: readiness.summary.blockers,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview
    },
    governance: {
      schemaVersion: governance.schemaVersion,
      status: governance.status,
      checksPass: governance.checks.filter((check) => check.status === "pass").length,
      checksReview: governance.checks.filter((check) => check.status === "review").length,
      keyChecks
    },
    oidc: oidcProviders.map((provider) => ({
      provider: provider.provider,
      mode: provider.mode,
      configured: provider.configured,
      missingEnv: provider.missingEnv
    })),
    env,
    serviceEndpoints: [
      { id: "ops-deployment", method: "GET", path: "/api/sena/ops/deployment", auth: "ops-bearer-or-session", schema: "sena-enterprise-organization-deployment/v1", purpose: "Redacted organization deployment handoff package" },
      { id: "ops-native-adapters", method: "GET", path: "/api/sena/ops/native-adapters", auth: "ops-bearer-or-session", schema: "sena-enterprise-native-adapter-certification/v1", purpose: "Native adapter certification dossier for institution platform owners" },
      { id: "ops-saas-operations", method: "GET", path: "/api/sena/ops/saas-operations", auth: "ops-bearer-or-session", schema: "sena-enterprise-saas-operations-readiness/v1", purpose: "Full SaaS operations readiness dossier linking platform approval, adapters, and release-gate evidence" },
      { id: "ops-identity-production-evidence", method: "GET", path: "/api/sena/ops/identity-production-evidence", auth: "ops-bearer-or-session", schema: "sena-enterprise-identity-production-evidence/v1", purpose: "Institution identity production evidence dossier for IdP, SSO, SCIM, and rotation handoff" },
      { id: "ops-capability-audit", method: "GET", path: "/api/sena/ops/capability-audit", auth: "ops-bearer-or-session", schema: "sena-enterprise-capability-audit/v1", purpose: "Enterprise capability audit mapping the original missing-feature backlog to runnable evidence and remaining platform decisions" },
      { id: "ops-go-live-rehearsal", method: "GET", path: "/api/sena/ops/go-live-rehearsal", auth: "ops-bearer-or-session", schema: "sena-enterprise-go-live-rehearsal/v1", purpose: "Go-live rehearsal dossier linking readiness, adapter certification, SaaS operations, rollback drill, post-cutover monitoring, persisted observation evidence, and release-gate evidence" },
      { id: "ops-go-live-closeout-actions", method: "POST", path: "/api/sena/ops/go-live-rehearsal", auth: "team-rbac", schema: "sena-enterprise-post-cutover-observation/v1", purpose: "Session and CSRF protected action bodies start, sample, and complete the 60-minute post-cutover observation before approved go-live attestation; actionless POST preserves cutover attestation creation" },
      { id: "ops-platform-decisions-list", method: "GET", path: "/api/sena/ops/platform-decisions", auth: "team-rbac", schema: "sena-enterprise-platform-decision-acceptances/v1", purpose: "List team-scoped platform decision acceptance records with the current register" },
      { id: "ops-platform-decisions-review", method: "POST", path: "/api/sena/ops/platform-decisions", auth: "team-rbac", schema: "sena-enterprise-platform-decision-acceptance/v1", purpose: "Record accepted, rejected, native-adapter-required, or superseded platform decisions" },
      { id: "ops-release-gate-list", method: "GET", path: "/api/sena/ops/release-gate", auth: "team-rbac", schema: "sena-enterprise-release-gate-reviews/v1", purpose: "List release gate review records with deployment-readiness and platform-decision snapshots" },
      { id: "ops-release-gate-review", method: "POST", path: "/api/sena/ops/release-gate", auth: "team-rbac", schema: "sena-enterprise-release-gate-review/v1", purpose: "Record approved, conditional, or blocked release-gate reviews before production handoff" },
      { id: "ops-readiness", method: "GET", path: "/api/sena/ops/readiness", auth: "ops-bearer-or-session", schema: "sena-enterprise-deployment-readiness/v1", purpose: "Production readiness gate" },
      { id: "ops-status", method: "GET", path: "/api/sena/ops/status", auth: "ops-bearer-or-session", schema: "sena-enterprise-ops-status/v1", purpose: "Runtime health and queue counters" },
      { id: "ops-alert-delivery", method: "POST", path: "/api/sena/ops/alerts", auth: "ops-bearer-or-session", schema: "sena-enterprise-ops-alert-delivery/v1", purpose: "Signed deployment alert delivery" },
      { id: "sso-preflight", method: "GET", path: "/api/auth/sso?status=1&preflight=1", auth: "session", schema: "sena-enterprise-sso-preflight/v1", purpose: "OAuth/OIDC provider preflight" },
      { id: "provisioning", method: "POST", path: "/api/sena/provisioning", auth: "provisioning-bearer", schema: "sena-enterprise-provisioning/v1", purpose: "Institution organization provisioning" },
      { id: "scim-users", method: "POST", path: "/api/sena/scim/v2/Users", auth: "provisioning-bearer", schema: "sena-scim-provisioning-bridge/v1", purpose: "SCIM 2.0 user provisioning bridge" },
      { id: "audit-forwarding", method: "POST", path: "/api/sena/governance/audit", auth: "team-rbac", schema: "sena-enterprise-audit-delivery/v1", purpose: "Signed audit/SIEM forwarding" },
      { id: "backup-delivery", method: "POST", path: "/api/sena/governance/backup", auth: "team-rbac", schema: "sena-enterprise-backup-delivery/v1", purpose: "Signed backup delivery and restore rehearsal" }
    ],
    platformDecisions: decisions,
    platformDecisionRegister,
    nativeAdapterCertification,
    saasOperationsReadiness,
    identityProductionEvidence,
    identityProductionHandoff,
    releaseGate,
    verification: {
      commands: readiness.runbook.verificationCommands,
      releaseGate: "npm run sena:pilot:verify"
    }
  };
}

export function getEnterpriseGovernanceStatus(): SenaEnterpriseGovernanceStatus {
  const db = readEnterpriseDb();
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const configuredDirectory = process.env.SENA_ENTERPRISE_DB_DIR ? "env-configured" : "default-local";
  const postgresConfig = resolveEnterprisePostgresConfig();
  const storageEngine = enterprisePostgresStorageEngine(postgresConfig);
  const postgresStorage = enterprisePostgresStorageEvidence(postgresConfig);
  const permissions = Array.from(new Set(Object.values(rolePermissions).flat())).sort();
  const oidcProviders = getEnterpriseSsoProviderStatuses();
  const configuredOidcProviders = oidcProviders.filter((provider) => provider.configured);
  const ssoFallbackPolicy = enterpriseLocalSsoFallbackPolicy();
  const ssoPreflightPassed = ssoPreflightPassedProviders(db, oidcProviders);
  const ssoPreflightPassedProviderIds = new Set(ssoPreflightPassed.map((provider) => provider.provider));
  const ssoPreflightMissingConfiguredProviders = configuredOidcProviders
    .filter((provider) => !ssoPreflightPassedProviderIds.has(provider.provider));
  const ssoPreflightPassEvents = db.auditLog.filter((entry) => entry.event === "auth.sso.preflight.pass");
  const ssoPreflightFailEvents = db.auditLog.filter((entry) => entry.event === "auth.sso.preflight.fail");
  const backupEvents = db.auditLog.filter((entry) => entry.event === "governance.backup");
  const backupVerifyEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.verify");
  const backupDeliverEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.deliver");
  const backupDeliverFailEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.deliver.fail");
  const databaseSyncDeliverEvents = db.auditLog.filter((entry) => entry.event === "governance.database_sync.deliver");
  const databaseSyncFailEvents = db.auditLog.filter((entry) => entry.event === "governance.database_sync.fail");
  const alertDeliverEvents = db.auditLog.filter((entry) => entry.event === "ops.alert.deliver");
  const alertDeliverFailEvents = db.auditLog.filter((entry) => entry.event === "ops.alert.deliver.fail");
  const platformDecisionReviewEvents = db.auditLog.filter((entry) => entry.event === "ops.platform_decision.review");
  const releaseGateReviewEvents = db.auditLog.filter((entry) => entry.event === "ops.release_gate.review");
  const backupRestoreEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.restore");
  const uploadObjectStorageDeliverEvents = db.auditLog.filter((entry) => entry.event === "upload.object_storage.deliver");
  const uploadObjectStorageFailEvents = db.auditLog.filter((entry) => entry.event === "upload.object_storage.fail");
  const collaborationPubSubDeliverEvents = db.auditLog.filter((entry) => entry.event === "collaboration.pubsub.deliver");
  const collaborationPubSubFailEvents = db.auditLog.filter((entry) => entry.event === "collaboration.pubsub.fail");
  const membershipLifecycleEvents = db.auditLog.filter((entry) => entry.event === "team.membership.update");
  const acceptedInvitationEvents = db.auditLog.filter((entry) => entry.event === "team.invite.accept");
  const provisioningEvents = db.auditLog.filter((entry) => entry.event === "provisioning.sync");
  const provisionedTeams = db.teams.filter((team) => team.provisioning).length;
  const provisionedUsers = db.users.filter((user) => user.provisioning).length;
  const provisionedMemberships = db.memberships.filter((membership) => membership.provisioning).length;
  const revokedInvitationEvents = db.auditLog.filter((entry) => entry.event === "team.invite.revoke");
  const failedLoginEvents = db.auditLog.filter((entry) => entry.event === "auth.login.failed");
  const lockedLoginEvents = db.auditLog.filter((entry) => entry.event === "auth.login.locked");
  const sessionRevocationEvents = db.auditLog.filter((entry) => entry.event === "auth.session.revoke");
  const csrfFailEvents = db.auditLog.filter((entry) => entry.event === "security.csrf.fail");
  const activeAuthLockouts = (db.authLockouts ?? []).filter((lockout) => isAuthLockoutActive(lockout)).length;
  const activeApiRateLimits = pruneApiRateLimits(db);
  const rateLimitEvents = db.auditLog.filter((entry) => entry.event === "security.rate_limit");
  const enabledMfaUsers = new Set((db.mfaFactors ?? []).filter((factor) => !factor.disabledAt).map((factor) => factor.userId)).size;
  const mfaChallengeEvents = db.auditLog.filter((entry) => entry.event === "auth.mfa.challenge");
  const mfaVerifyEvents = db.auditLog.filter((entry) => entry.event === "auth.mfa.verify");
  const activePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now()).length;
  const passwordResetRequestEvents = db.auditLog.filter((entry) => entry.event === "auth.password_reset.request");
  const passwordResetCompleteEvents = db.auditLog.filter((entry) => entry.event === "auth.password_reset.complete");
  const notificationEvents = db.auditLog.filter((entry) => entry.event === "notification.queue");
  const notificationReadEvents = db.auditLog.filter((entry) => entry.event === "notification.read");
  const notificationWebhookDeliverEvents = db.auditLog.filter((entry) => entry.event === "notification.webhook.deliver");
  const notificationWebhookFailEvents = db.auditLog.filter((entry) => entry.event === "notification.webhook.fail");
  const emailQueueEvents = db.auditLog.filter((entry) => entry.event === "email.queue");
  const emailWebhookDeliverEvents = db.auditLog.filter((entry) => entry.event === "email.webhook.deliver");
  const emailWebhookFailEvents = db.auditLog.filter((entry) => entry.event === "email.webhook.fail");
  const unreadNotifications = db.notifications.filter((notification) => notification.status !== "read").length;
  const webhookProvider = notificationWebhookProvider();
  const objectStorageProvider = objectStorageWebhookProvider();
  const backupProvider = backupWebhookProvider();
  const databaseSyncProvider = databaseSyncWebhookProvider();
  const collaborationProvider = collaborationPubSubProvider();
  const collaborationPubSubQueuedEvents = (db.collaborationEvents ?? []).length;
  const collaborationPubSubPending = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "pending").length;
  const collaborationPubSubDelivered = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "delivered").length;
  const collaborationPubSubFailed = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "failed").length;
  const webhookPendingNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "pending").length;
  const webhookDeliveredNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "delivered").length;
  const webhookFailedNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "failed").length;
  const emailProvider = emailWebhookProvider();
  const emailPendingDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "pending").length;
  const emailDeliveredDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "delivered").length;
  const emailFailedDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "failed").length;
  const auditProvider = auditWebhookProvider();
  const provisioningTokenEvidence = provisioningTokenProductionEvidence();
  const auditWebhookPendingEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "pending").length;
  const auditWebhookDeliveredEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "delivered").length;
  const auditWebhookFailedEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "failed").length;
  const auditIntegrity = verifyEnterpriseAuditIntegrity();
  const uploadStorageVerification = verifyEnterpriseUploadStorage();
  const opsStatus = getEnterpriseOpsStatus();
  const alertProvider = alertWebhookProvider();
  const configuredAlertingOwner = alertingOwner();
  const configuredAlertingRunbookUrl = alertingRunbookUrl();
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "auth-session",
      label: "Authentication and session policy",
      status: "pass",
      evidence: [
        "passwordHash=pbkdf2-sha256",
        `sessionCookie=${senaSessionCookieName}`,
        `sessionDays=${sessionDays}`,
        `rememberedSessionDays=${rememberedSessionDays}`,
        "sessionProfiles=standard|remembered",
        `activeSessions=${db.sessions.length}`,
        "sessionLifecycleApi=/api/auth/sessions",
        "sessionLifecycleSchema=sena-enterprise-session-list/v1|sena-enterprise-session-revocation/v1",
        `sessionRevocationEvents=${sessionRevocationEvents.length}`,
        `csrf=header:${senaCsrfHeaderName}/keySource:${csrfKeySource()}`,
        "csrfCoverage=session-mutating-api",
        "csrfTokenApi=/api/auth/csrf",
        `csrfFailEvents=${csrfFailEvents.length}`,
        `loginLockout=maxFailures:${authLockoutMaxFailures}/windowMinutes:${authLockoutWindowMinutes}/lockoutMinutes:${authLockoutMinutes}`,
        `activeLockouts=${activeAuthLockouts}`,
        `failedLoginEvents=${failedLoginEvents.length}`,
        `lockedLoginEvents=${lockedLoginEvents.length}`,
        `rateLimit=auth:${authApiRateLimitMaxRequests}/${authApiRateLimitWindowSeconds}s,passwordReset:${passwordResetRateLimitMaxRequests}/${passwordResetRateLimitWindowSeconds}s,sso:${ssoRateLimitMaxRequests}/${ssoRateLimitWindowSeconds}s`,
        `activeRateLimitBuckets=${activeApiRateLimits.length}`,
        `rateLimitEvents=${rateLimitEvents.length}`,
        `mfa=totp/enabledUsers:${enabledMfaUsers}/challengeMinutes:${mfaChallengeMinutes}/setupMinutes:${mfaSetupMinutes}`,
        `mfaSecretStorage=aes-256-gcm/keySource:${mfaKeySource()}`,
        `mfaChallengeEvents=${mfaChallengeEvents.length}`,
        `mfaVerifyEvents=${mfaVerifyEvents.length}`,
        `passwordReset=minutes:${passwordResetMinutes}/activeRequests:${activePasswordResetRequests}/delivery:${passwordResetTokenExposure() ? "local-token" : emailProvider.configured ? "email-webhook" : "email-provider-required"}`,
        `passwordPolicy=${passwordPolicyEvidence()}`,
        `passwordResetRequestEvents=${passwordResetRequestEvents.length}`,
        `passwordResetCompleteEvents=${passwordResetCompleteEvents.length}`,
        "ssoModes=institution|google|orcid"
      ],
      nextAction: "Keep password policy, session TTL, and cookie settings aligned with the institution's security review."
    },
    {
      id: "oauth-oidc-sso",
      label: "OAuth/OIDC SSO provider configuration and preflight",
      status: selfManagedEnterprise || configuredOidcProviders.length > 0 && ssoPreflightMissingConfiguredProviders.length === 0 ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        ...oidcProviders.map((provider) => (
          `${provider.provider}=${provider.mode};missing=${provider.missingEnv.join("|") || "none"};clientSecretStrength=${provider.clientSecretStrength};endpointHostPolicy=${provider.endpointHostPolicy}`
        )),
        ...ssoPreflightEvidence(db, oidcProviders),
        `preflightPassEvents=${ssoPreflightPassEvents.length}`,
        `preflightFailEvents=${ssoPreflightFailEvents.length}`,
        "preflightApi=/api/auth/sso?status=1&preflight=1",
        "preflightSchema=sena-enterprise-sso-preflight/v1",
        "pkce=S256",
        "state=hashed-server-side",
        "nonce=state-bound",
        "idTokenNonce=validated-when-present",
        "idTokenSignature=jwks",
        "idTokenClaims=issuer|audience|nonce|exp|iat",
        `localFallback=${ssoFallbackPolicy.enabled ? "enabled" : "disabled"}`,
        `fallbackPolicy=${ssoFallbackPolicy.schemaVersion}`,
        `fallbackProductionRuntime=${ssoFallbackPolicy.productionRuntime ? "yes" : "no"}`,
        `fallbackOverride=${ssoFallbackPolicy.explicitOverride ? "enabled" : "disabled"}`,
        `preflightPassedProviders=${ssoPreflightPassed.map((provider) => provider.provider).join("|") || "none"}`,
        `preflightMissingProviders=${ssoPreflightMissingConfiguredProviders.map((provider) => provider.provider).join("|") || "none"}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
        : configuredOidcProviders.length > 0 && ssoPreflightMissingConfiguredProviders.length === 0
        ? "Complete provider-side redirect URI approval, keep preflight in release checks, and rotate client secrets through the deployment secret store."
        : configuredOidcProviders.length > 0
          ? "Run SSO preflight for every configured OAuth/OIDC provider before production SSO is claimed."
          : "Configure at least one SENA_SSO_* OAuth/OIDC provider and run SSO preflight before production SSO is claimed."
    },
    {
      id: "security-response-headers",
      label: "Browser security response headers",
      status: "pass",
      evidence: [
        "middleware=next",
        "header=x-content-type-options:nosniff",
        "header=x-frame-options:DENY",
        "header=referrer-policy:strict-origin-when-cross-origin",
        "header=permissions-policy:camera=(), microphone=(), geolocation=(), payment=()",
        "header=strict-transport-security:max-age=63072000; includeSubDomains; preload",
        "header=cross-origin-opener-policy:same-origin",
        "header=cross-origin-resource-policy:same-origin",
        "header=content-security-policy-report-only",
        "cspMode=report-only",
        "cspDirectives=default-src 'self'|frame-ancestors 'none'|object-src 'none'|upgrade-insecure-requests",
        "apiCacheControl=no-store"
      ],
      nextAction: "Review CSP violation reports, then move to enforcing Content-Security-Policy when all institution integrations are allow-listed."
    },
    {
      id: "rbac",
      label: "RBAC roles and permissions",
      status: "pass",
      evidence: Object.entries(rolePermissions).map(([role, rolePerms]) => `${role}=${rolePerms.join("|")}`),
      nextAction: "Review role matrix with the research governance owner before onboarding external labs."
    },
    {
      id: "team-lifecycle-governance",
      label: "Team membership and invitation lifecycle",
      status: "pass",
      evidence: [
        `activeMemberships=${db.memberships.filter((membership) => membership.status === "active").length}`,
        `suspendedMemberships=${db.memberships.filter((membership) => membership.status === "suspended").length}`,
        `pendingInvitations=${db.invitations.filter((invitation) => invitation.status === "pending").length}`,
        `acceptedInvitations=${db.invitations.filter((invitation) => invitation.status === "accepted").length}`,
        `revokedInvitations=${db.invitations.filter((invitation) => invitation.status === "revoked").length}`,
        `invitationAcceptances=${acceptedInvitationEvents.length}`,
        `membershipUpdates=${membershipLifecycleEvents.length}`,
        `invitationRevocations=${revokedInvitationEvents.length}`,
        "guardrail=last-active-team-manager-required"
      ],
      nextAction: "Connect lifecycle events to institution notifications and review SCIM/IdP provisioning ownership before organization-wide rollout."
    },
    {
      id: "organization-provisioning",
      label: "Organization provisioning and IdP sync",
      status: selfManagedEnterprise || provisioningTokenEvidence.ready ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence(["provisioningMode=manual-local"]) : []),
        "schema=sena-enterprise-provisioning/v1",
        "api=/api/sena/provisioning",
        "scimApi=/api/sena/scim/v2",
        "scimSchemas=User|Group|EnterpriseUser|SENAUser|SENAGroup",
        "auth=bearer-token-hash-compare",
        "supports=teams|users|sso-identities|memberships|dry-run|scim-users|scim-groups",
        "guardrail=last-active-team-manager-required",
        "token=redacted",
        ...provisioningTokenEvidence.evidence,
        `provisionedTeams=${provisionedTeams}`,
        `provisionedUsers=${provisionedUsers}`,
        `provisionedMemberships=${provisionedMemberships}`,
        `syncEvents=${provisioningEvents.length}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep manual local membership and RBAC evidence current; SCIM provisioning is not required for this self-managed deployment."
        : provisioningTokenEvidence.ready
        ? "Map this endpoint to the institution IdP or SCIM bridge and document ownership for user lifecycle changes."
        : provisioningTokenEvidence.present
          ? "Rotate SENA_PROVISIONING_TOKEN to a production secret-store value before claiming institution-managed provisioning."
          : "Set SENA_PROVISIONING_TOKEN before claiming institution-managed provisioning."
    },
    {
      id: "persistence",
      label: "Project persistence",
      status: postgresConfig.configured || configuredDirectory === "env-configured" ? "pass" : "review",
      evidence: [
        `engine=${storageEngine}`,
        `configuredDirectory=${configuredDirectory}`,
        ...(postgresConfig.adapterRequested ? enterprisePostgresPublicEvidence(postgresConfig) : []),
        `projects=${db.projects.length}`,
        `revisions=${db.projectRevisions.length}`,
        "optimisticConcurrency=currentVersion/expectedVersion",
        "conflictStatus=409:project_version_conflict",
        "revisionRestore=append-only",
        `revisionRestoreEvents=${db.auditLog.filter((entry) => entry.event === "project.restore").length}`
      ],
      nextAction: postgresConfig.configured
        ? "Keep Neon/Postgres backup, branching, and restore drills in release verification."
        : configuredDirectory === "env-configured"
          ? "Back up the configured enterprise data directory and set retention policy."
        : "Set SENA_ENTERPRISE_DB_DIR to a managed, backed-up path or replace the adapter with a managed database before production."
    },
    {
      id: "database-sync-bridge",
      label: "Managed database sync bridge",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-database-sync/v1",
        "webhookSchema=sena-enterprise-database-sync-webhook/v1",
        "api=/api/sena/governance/backup",
        "deliveryApi=POST:/api/sena/governance/backup action=sync-database",
        "syncKind=sanitized-enterprise-state",
        "preflight=backup-checksum|backup-record-counts|backup-secret-exclusions",
        "sourceStorage=file-backed-json",
        `webhookProvider=${databaseSyncProvider.mode}`,
        `webhookEndpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `webhookSecret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${databaseSyncProvider.timeoutMs}`,
        `deliverEvents=${databaseSyncDeliverEvents.length}`,
        `failEvents=${databaseSyncFailEvents.length}`
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep sanitized enterprise-state sync connected to the managed database adapter and monitor failed sync events."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before claiming external managed database mirroring."
    },
    {
      id: "backup-restore-rehearsal",
      label: "Backup export and restore rehearsal",
      status: "pass",
      evidence: [
        "schema=sena-enterprise-backup/v1",
        "verifySchema=sena-enterprise-backup-verification/v1",
        "webhookSchema=sena-enterprise-backup-webhook/v1",
        "api=/api/sena/governance/backup",
        "deliveryApi=POST:/api/sena/governance/backup action=deliver",
        "restore=merge|dry-run",
        "scope=team-manage-only",
        "checksum=payload-sha256",
        "excluded=sessions|ssoStates|authLockouts|apiRateLimits|mfaSecrets|mfaChallenges|emailDeliveries|passwordResetTokens|projectPresence|collaborationEvents|passwordHash|uploadBlobs",
        `webhookProvider=${backupProvider.mode}`,
        `webhookEndpointHash=${backupProvider.endpointHash ?? "none"}`,
        `webhookSecret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${backupProvider.timeoutMs}`,
        `backupEvents=${backupEvents.length}`,
        `verifyEvents=${backupVerifyEvents.length}`,
        `deliverEvents=${backupDeliverEvents.length}`,
        `deliverFailEvents=${backupDeliverFailEvents.length}`,
        `restoreEvents=${backupRestoreEvents.length}`
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep signed scheduled backups going to managed storage and rehearse dry-run plus merge restore before institutional deployment."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET, then run signed backup delivery plus restore rehearsal before institutional deployment."
    },
    {
      id: "deployment-monitoring",
      label: "Deployment monitoring and operational readiness",
      status: opsStatus.storage.writable &&
        opsStatus.deployment.opsTokenConfigured &&
        Boolean(configuredAlertingOwner) &&
        alertProvider.configured &&
        alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-ops-status/v1",
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics",
        "alertsApi=/api/sena/ops/alerts",
        "alertDeliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "alertWebhookSchema=sena-enterprise-ops-alert-webhook/v1",
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        `alertingOwner=${configuredAlertingOwner ? "configured" : "missing"}`,
        `alertingChannel=${alertingChannel()}`,
        `alertingRunbook=${configuredAlertingRunbookUrl ? "configured" : "missing"}`,
        `alertWebhookProvider=${alertProvider.mode}`,
        `alertWebhookEndpointHash=${alertProvider.endpointHash ?? "none"}`,
        `alertWebhookSecret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `alertWebhookTimeoutMs=${alertProvider.timeoutMs}`,
        `alertDeliverEvents=${alertDeliverEvents.length}`,
        `alertDeliverFailEvents=${alertDeliverFailEvents.length}`,
        `opsStatus=${opsStatus.status}`,
        `storageWritable=${opsStatus.storage.writable}`,
        `backupStatus=${opsStatus.backup.status}`,
        `node=${opsStatus.deployment.nodeVersion}`,
        `uptimeSeconds=${opsStatus.deployment.uptimeSeconds}`
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured && configuredAlertingOwner && alertProvider.configured && alertProvider.secretConfigured
        ? "Connect status, metrics, and signed alert delivery to the deployment monitor and incident runbook."
        : "Set SENA_OPS_TOKEN, SENA_ALERTING_OWNER, SENA_ALERT_WEBHOOK_URL, and SENA_ALERT_WEBHOOK_SECRET before exposing operational endpoints to deployment monitoring."
    },
    {
      id: "organization-deployment-package",
      label: "Organization deployment handoff package",
      status: opsStatus.deployment.opsTokenConfigured && Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")) ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-organization-deployment/v1",
        "platformDecisionRegister=sena-enterprise-platform-decision-register/v1",
        `platformDecisionAcceptances=${(db.platformDecisionAcceptances ?? []).length}`,
        `platformDecisionReviewEvents=${platformDecisionReviewEvents.length}`,
        "api=/api/sena/ops/deployment",
        "auth=ops-bearer-token-or-session",
        "redaction=secret-values-excluded|endpoint-values-hashed|secret-hashing-disabled",
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        `baseUrl=${envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") ? "configured" : "missing"}`,
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`,
        "includes=env-inventory|service-endpoints|readiness-summary|governance-key-checks|platform-decisions|platform-decision-register"
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured && Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL"))
        ? "Attach the redacted organization deployment package to platform handoff and release review."
        : "Set SENA_OPS_TOKEN and SENA_APP_URL before handing deployment evidence to an institution platform team."
    },
    {
      id: "release-gate-review",
      label: "Release gate review",
      status: (db.releaseGateReviews ?? []).length > 0 ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-release-gate-review/v1",
        "listSchema=sena-enterprise-release-gate-reviews/v1",
        "api=/api/sena/ops/release-gate",
        "auth=team-rbac",
        `releaseGateReviews=${(db.releaseGateReviews ?? []).length}`,
        `reviewEvents=${releaseGateReviewEvents.length}`,
        `latestStatus=${(db.releaseGateReviews ?? [])[0]?.decision ?? "missing"}`,
        "snapshot=deployment-readiness|platform-decision-register",
        "verificationCommand=npm run sena:pilot:verify",
        "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
        `latestVerificationStatus=${(db.releaseGateReviews ?? [])[0]?.verificationEvidence?.status ?? "missing"}`,
        `latestVerificationOutputSha256=${(db.releaseGateReviews ?? [])[0]?.verificationEvidence?.outputSha256 ? "present" : "missing"}`
      ],
      nextAction: (db.releaseGateReviews ?? []).length > 0
        ? "Attach the release gate review record to the deployment handoff package before institution rollout."
        : "Record a release gate review after readiness, platform decisions, and verification commands have been reviewed."
    },
    {
      id: "upload-registry",
      label: "Upload registry and source-file lineage",
      status: "pass",
      evidence: [
        `uploads=${db.uploads.length}`,
        "fileHash=sha256",
        "storage=private-enterprise-upload-directory",
        "objectStorageDelivery=POST:/api/sena/uploads action=deliver-object-storage",
        "objectStorageWebhookSchema=sena-enterprise-upload-object-storage-webhook/v1",
        `objectStorageProvider=${objectStorageProvider.mode}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `objectStorageDeliverEvents=${uploadObjectStorageDeliverEvents.length}`,
        `objectStorageFailEvents=${uploadObjectStorageFailEvents.length}`,
        "metadata=team|user|contentType|size|adapterProfile|scanStatus"
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Keep signed object-storage handoff and scan-review policy documented before cross-organization deployment."
        : "Move upload blobs to managed object storage with retention and malware scanning before cross-organization deployment."
    },
    {
      id: "upload-security-scan",
      label: "Upload security and DLP scan",
      status: "pass",
      evidence: [
        `engine=${uploadScanEngine}`,
        `maxBytes=${maxUploadBytes}`,
        `passed=${db.uploads.filter((upload) => upload.scanStatus === "passed").length}`,
        `review=${db.uploads.filter((upload) => upload.scanStatus === "review").length}`,
        `allowedExtensions=${Array.from(allowedUploadExtensions).join("|")}`,
        "blocked=empty|oversized|unsupported-extension|executable-magic"
      ],
      nextAction: "Replace the local heuristic scanner with institution-approved malware scanning and DLP before regulated deployment."
    },
    {
      id: "upload-storage-integrity",
      label: "Upload blob integrity verification",
      status: uploadStorageVerification.status,
      evidence: [
        "schema=sena-enterprise-upload-storage-verification/v1",
        "objectStorageWebhookSchema=sena-enterprise-upload-object-storage-webhook/v1",
        "storage=private-local-directory",
        `objectStorageProvider=${objectStorageProvider.mode}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`,
        `registeredBytes=${uploadStorageVerification.summary.totalRegisteredBytes}`,
        `verifiedBytes=${uploadStorageVerification.summary.totalVerifiedBytes}`
      ],
      nextAction: uploadStorageVerification.status === "pass"
        ? "Keep upload blob integrity verification active before each signed object-storage delivery run."
        : "Repair missing, corrupt, or orphan upload blobs before production handoff."
    },
    {
      id: "import-run-history",
      label: "Import run history and data-quality lineage",
      status: "pass",
      evidence: [
        `importRuns=${db.importRuns.length}`,
        `warnings=${db.importRuns.reduce((total, run) => total + run.warningCount, 0)}`,
        `profiles=${Array.from(new Set(db.importRuns.flatMap((run) => run.sources.map((source) => source.profile)))).join("|") || "none"}`,
        `cleaningManifests=${db.importRuns.filter((run) => run.cleaningManifest?.schemaVersion === "sena-import-cleaning-manifest/v1").length}`,
        "cleaningManifest=sena-import-cleaning-manifest/v1",
        "lineage=uploadIds|adapterProfiles|datasetCounts|warningsPreview|cleaningManifest",
        "adapters=csv|excel|sena-json|lms-forum-json|lms-forum-export|cleaned-transcript"
      ],
      nextAction: "Add malware scanning, DLP checks, and institution-approved retention rules before cross-organization imports."
    },
    {
      id: "analysis-run-history",
      label: "Server-side SENA analysis run history",
      status: "pass",
      evidence: [
        `analysisRuns=${db.analysisRuns.length}`,
        "schema=sena-analysis-run/v1",
        "api=/api/sena/analyze",
        "historyApi=GET:/api/sena/analyze",
        "lineage=team|project|persistedProject|sourceKind|datasetCounts|activeTemporalWindow",
        "artifactFingerprints=reportSha256|projectSnapshotSha256|runtimeBundleSha256",
        `runtimeBundles=${db.analysisRuns.filter((run) => run.includeRuntimeBundle).length}`,
        `projectLinked=${db.analysisRuns.filter((run) => run.projectId || run.persistedProjectId).length}`
      ],
      nextAction: "Use analysis run IDs and artifact fingerprints when reviewing server-side SENA outputs across teams."
    },
    {
      id: "audit-log",
      label: "Audit logging",
      status: auditIntegrity.status,
      evidence: [
        "schema=sena-enterprise-audit-integrity/v1",
        `auditEvents=${db.auditLog.length}`,
        `retention=max-${auditRetentionMaxEvents}-events`,
        `retentionDays=${auditIntegrity.retention.retentionWindowDays ?? "missing"}`,
        `chainHead=${auditIntegrity.chain.headHash}`,
        `integrity=${auditIntegrity.status}`,
        "api=/api/sena/governance/audit",
        "integrityApi=/api/sena/governance/audit?integrity=1",
        "deliveryApi=POST:/api/sena/governance/audit",
        "webhookSchema=sena-enterprise-audit-webhook/v1",
        `webhookProvider=${auditProvider.mode}`,
        `webhookEndpointHash=${auditProvider.endpointHash ?? "none"}`,
        `webhookSecret=${auditProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookPending=${auditWebhookPendingEvents}`,
        `webhookDelivered=${auditWebhookDeliveredEvents}`,
        `webhookFailed=${auditWebhookFailedEvents}`,
        "exports=json|csv",
        "filters=team|event|user|project|date",
        "events=auth|auth.login.failed|auth.login.locked|auth.mfa|auth.password_reset|security.rate_limit|team|project|import|reliability|inference|export|notification|email|governance"
      ],
      nextAction: auditIntegrity.status === "pass"
        ? "Forward signed audit events and chain heads to institutional logging or SIEM storage before regulated deployment."
        : "Set audit retention policy and repair audit integrity checks before regulated deployment."
    },
    {
      id: "reliability-run-history",
      label: "Reliability run history",
      status: "pass",
      evidence: [
        `reliabilityRuns=${db.reliabilityRuns.length}`,
        `approved=${db.reliabilityRuns.filter((run) => run.status === "approved").length}`,
        `pending=${db.reliabilityRuns.filter((run) => run.status === "pending-review" || run.status === "pending-adjudication").length}`,
        `reliabilityAdjudications=${db.adjudications.filter((record) => record.reliabilityRunId).length}`,
        "dashboard=sena-coding-reliability-dashboard/v1",
        "adjudicationCoverage=sena-reliability-adjudication-coverage/v1",
        `latestAdjudicationCoverage=${db.reliabilityRuns[0]?.adjudicationCoverage?.coverageRate ?? "missing"}`,
        `latestUnresolvedDisagreements=${db.reliabilityRuns[0]?.adjudicationCoverage?.unresolvedDisagreements ?? "missing"}`,
        "metrics=cohen-kappa|krippendorff-alpha|adjudication-queue|code-diagnostics",
        "diagnostics=code-level-agreement|coder-positive-rate-drift",
        "lineage=input-file-sha256|team|project|reviewer|reliabilityRunId",
        "signoff=pending-review|pending-adjudication|approved|rejected"
      ],
      nextAction: "Connect reliability run sign-off and adjudication decisions to the formal preregistration workflow before publication claims."
    },
    {
      id: "validation-run-history",
      label: "Group-comparison validation run history",
      status: "pass",
      evidence: [
        `validationRuns=${db.validationRuns.length}`,
        `approved=${db.validationRuns.filter((run) => run.status === "approved").length}`,
        `pending=${db.validationRuns.filter((run) => run.status === "pending-review").length}`,
        "schema=sena-group-comparison/v1|sena-group-comparison-suite/v1",
        "method=permutation-two-sided|bootstrap-ci|effect-size",
        "multipleComparison=holm",
        `suiteRuns=${db.validationRuns.filter((run) => run.result?.schemaVersion === "sena-group-comparison-suite/v1").length}`,
        `preregistrationPlans=${db.validationRuns.filter((run) => run.preregistrationPlan?.schemaVersion === "sena-validation-preregistration-plan/v1").length}`,
        "preregistrationPlan=sena-validation-preregistration-plan/v1",
        "planHash=sha256",
        "planLock=analysis-parameters|protocol-note-hash|method-note-hash",
        `parityEvidenceRuns=${db.validationRuns.filter((run) => run.parityEvidence?.schemaVersion === "sena-validation-parity-evidence/v1").length}`,
        `parityReadyForReview=${db.validationRuns.filter((run) => run.parityEvidence?.status === "ready-for-review").length}`,
        "parityEvidence=sena-validation-parity-evidence/v1",
        "runtimeParity=jena-rena-sample-parity|jsna-r-sna-social-parity",
        "guardrail=descriptive-validation-not-preregistered-inference"
      ],
      nextAction: "Attach preregistration identifiers, domain expert review, and final inferential model references before publication or assessment claims."
    },
    {
      id: "domain-expert-review",
      label: "Domain expert review workflow",
      status: "pass",
      evidence: [
        `expertReviews=${db.expertReviews.length}`,
        `approved=${db.expertReviews.filter((review) => review.status === "approved").length}`,
        `changesRequested=${db.expertReviews.filter((review) => review.status === "changes-requested").length}`,
        `claimReadyWithLimits=${db.expertReviews.filter((review) => review.claimScope === "claim-ready-with-limits").length}`,
        "schema=sena-enterprise-expert-review/v1",
        "ratings=data-adequacy|method-fit|interpretation-validity",
        "targets=project|validation-run|reliability-run|claim",
        "signoff=requested|approved|changes-requested|rejected"
      ],
      nextAction: "Require at least one approved domain expert review before treating SENA patterns as publication-facing claims."
    },
    {
      id: "collaboration-governance",
      label: "Collaboration stream and adjudication records",
      status: "pass",
      evidence: [
        "transport=sse:/api/sena/projects/:projectId/collaboration/stream",
        "streamSchema=sena-project-collaboration-stream/v1",
        "saveGuard=expectedVersion-409-conflict",
        "revisionRestoreGuard=expectedVersion-append-only",
        "pubsubDeliveryApi=POST:/api/sena/projects/:projectId/collaboration action=deliver-pubsub",
        "pubsubWebhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1",
        `pubsubProvider=${collaborationProvider.mode}`,
        `pubsubEndpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `pubsubSecret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `pubsubTimeoutMs=${collaborationProvider.timeoutMs}`,
        `pubsubMaxAttempts=${collaborationProvider.maxAttempts}`,
        `pubsubQueued=${collaborationPubSubQueuedEvents}`,
        `pubsubPending=${collaborationPubSubPending}`,
        `pubsubDelivered=${collaborationPubSubDelivered}`,
        `pubsubFailed=${collaborationPubSubFailed}`,
        `pubsubDeliverEvents=${collaborationPubSubDeliverEvents.length}`,
        `pubsubFailEvents=${collaborationPubSubFailEvents.length}`,
        `comments=${db.projectComments.length}`,
        `presence=${db.projectPresence.length}`,
        `adjudications=${db.adjudications.length}`
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured
        ? "Keep signed collaboration events flowing to the selected external pub/sub bus and monitor failed deliveries."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET before multi-runtime collaboration delivery is claimed."
    },
    {
      id: "notification-delivery",
      label: "Notification outbox and delivery",
      status: "pass",
      evidence: [
        "schema=sena-enterprise-notifications/v1",
        "api=/api/sena/notifications",
        "delivery=local-in-app-outbox",
        "deliveryWorker=POST:/api/sena/notifications",
        "emailDeliveryWorker=POST:/api/sena/notifications action=deliver-email",
        "emailWebhookSchema=sena-enterprise-email-webhook/v1",
        `webhookProvider=${webhookProvider.mode}`,
        `webhookEndpointHash=${webhookProvider.endpointHash ?? "none"}`,
        `webhookSecret=${webhookProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${webhookProvider.timeoutMs}`,
        `webhookMaxAttempts=${webhookProvider.maxAttempts}`,
        `emailWebhookProvider=${emailProvider.mode}`,
        `emailWebhookEndpointHash=${emailProvider.endpointHash ?? "none"}`,
        `emailWebhookSecret=${emailProvider.secretConfigured ? "configured" : "missing"}`,
        `emailWebhookTimeoutMs=${emailProvider.timeoutMs}`,
        `emailWebhookMaxAttempts=${emailProvider.maxAttempts}`,
        `notifications=${db.notifications.length}`,
        `unread=${unreadNotifications}`,
        `webhookPending=${webhookPendingNotifications}`,
        `webhookDelivered=${webhookDeliveredNotifications}`,
        `webhookFailed=${webhookFailedNotifications}`,
        `emailPending=${emailPendingDeliveries}`,
        `emailDelivered=${emailDeliveredDeliveries}`,
        `emailFailed=${emailFailedDeliveries}`,
        `queuedEvents=${notificationEvents.length}`,
        `readEvents=${notificationReadEvents.length}`,
        `webhookDeliverEvents=${notificationWebhookDeliverEvents.length}`,
        `webhookFailEvents=${notificationWebhookFailEvents.length}`,
        `emailQueueEvents=${emailQueueEvents.length}`,
        `emailWebhookDeliverEvents=${emailWebhookDeliverEvents.length}`,
        `emailWebhookFailEvents=${emailWebhookFailEvents.length}`,
        "events=team.invite|auth.password_reset|project.comment|reliability.review|validation.review|expert.review"
      ],
      nextAction: emailProvider.configured && emailProvider.secretConfigured
        ? "Keep institution email webhook retention and replay ownership documented before organization-wide rollout."
        : "Connect signed institution email delivery for password reset and team invitations before organization-wide rollout."
    }
  ];

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGovernance,
    status: checks.every((check) => check.status === "pass") ? "ready" : "review",
    generatedAt: now(),
    storage: {
      engine: storageEngine,
      configuredDirectory,
      pathHint: path.basename(dbDir),
      ...(postgresStorage ? { postgres: postgresStorage } : {})
    },
    auth: {
      passwordHash: "pbkdf2-sha256",
      ssoModes: ssoProviders,
      oidcProviders,
      callbackPath: ssoCallbackPath,
      sessionCookie: senaSessionCookieName,
      sessionDays,
      sessionPolicy: {
        standardDays: standardSessionDays,
        rememberedDays: rememberedSessionDays
      },
      loginLockout: {
        maxFailures: authLockoutMaxFailures,
        windowMinutes: authLockoutWindowMinutes,
        lockoutMinutes: authLockoutMinutes,
        activeLockouts: activeAuthLockouts
      },
      mfa: {
        methods: ["totp"],
        enabledUsers: enabledMfaUsers,
        challengeMinutes: mfaChallengeMinutes,
        setupMinutes: mfaSetupMinutes,
        secretStorage: "aes-256-gcm",
        keySource: mfaKeySource()
      },
      passwordReset: {
        expiresMinutes: passwordResetMinutes,
        activeRequests: activePasswordResetRequests,
        delivery: passwordResetTokenExposure() ? "local-token" : emailProvider.configured ? "email-webhook" : "email-provider-required"
      },
      passwordPolicy: enterprisePasswordPolicy
    },
    rbac: {
      roles: Object.keys(rolePermissions) as SenaEnterpriseRole[],
      permissions: permissions as SenaEnterprisePermission[]
    },
    counts: {
      users: db.users.length,
      teams: db.teams.length,
      projects: db.projects.length,
      uploads: db.uploads.length,
      importRuns: db.importRuns.length,
      analysisRuns: db.analysisRuns.length,
      reliabilityRuns: db.reliabilityRuns.length,
      validationRuns: db.validationRuns.length,
      expertReviews: db.expertReviews.length,
      platformDecisionAcceptances: (db.platformDecisionAcceptances ?? []).length,
      releaseGateReviews: (db.releaseGateReviews ?? []).length,
      postCutoverObservations: (db.postCutoverObservations ?? []).length,
      goLiveAttestations: (db.goLiveAttestations ?? []).length,
      projectRevisions: db.projectRevisions.length,
      comments: db.projectComments.length,
      adjudications: db.adjudications.length,
      collaborationEvents: (db.collaborationEvents ?? []).length,
      notifications: db.notifications.length,
      auditEvents: db.auditLog.length
    },
    checks
  };
}

export function enterpriseErrorResponse(error: unknown) {
  if (error instanceof SenaEnterpriseError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status
    };
  }
  return {
    body: { error: error instanceof Error ? error.message : "Unexpected SENA enterprise error.", code: "unexpected_error" },
    status: 500
  };
}
