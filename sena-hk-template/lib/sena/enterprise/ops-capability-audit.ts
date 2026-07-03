import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  buildEnterpriseIdentityRotationFreshness,
  type SenaEnterpriseIdentityProductionDecisionId
} from "./identity-readiness";
import {
  formatIdentityReceiptArchiveArtifactCompletenessCounts,
  formatIdentityReceiptArchiveMissingInputCounts
} from "./identity-receipt-archive";
import {
  getEnterpriseGoLiveRehearsal,
  getEnterpriseGoLiveRehearsalWithPostgresEvidence,
  type SenaEnterpriseGoLiveRehearsal
} from "./ops-go-live";
import { getEnterpriseSecurityPosture } from "./ops-security";
import {
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb
} from "./state";
import {
  getEnterpriseOrganizationDeploymentPackage,
  getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence,
  type SenaEnterpriseOrganizationDeploymentPackage
} from "./ops-deployment";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  getEnterpriseGovernanceStatus,
  getEnterpriseGovernanceStatusWithPostgresEvidence,
  type SenaEnterpriseGovernanceStatus
} from "./ops-governance";
import {
  idpAcceptanceEvidence,
  provisioningOwnerAcceptanceEvidence
} from "./ops-platform-decision-checklist";
import {
  latestPlatformDecisionAcceptances,
  missingPlatformDecisionProductionEvidence,
  platformDecisionProductionEvidenceReceipt
} from "./ops-platform-decisions";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus
} from "./ops-status";

function now() {
  return new Date().toISOString();
}

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

export function getEnterpriseCapabilityAudit(input: {
  teamId?: string;
  deployment?: SenaEnterpriseOrganizationDeploymentPackage;
  readiness?: SenaEnterpriseDeploymentReadiness;
  goLiveRehearsal?: SenaEnterpriseGoLiveRehearsal;
  governance?: SenaEnterpriseGovernanceStatus;
  opsStatus?: SenaEnterpriseOpsStatus;
  db?: SenaEnterpriseDb;
} = {}): SenaEnterpriseCapabilityAudit {
  const db = input.db ?? readEnterpriseDb();
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const opsStatus = input.opsStatus ?? getEnterpriseOpsStatus();
  const readiness = input.readiness ?? getEnterpriseDeploymentReadiness({ opsStatus });
  const deployment = input.deployment ?? getEnterpriseOrganizationDeploymentPackage({
    teamId: input.teamId,
    readiness,
    opsStatus,
    db
  });
  const governance = input.governance ?? getEnterpriseGovernanceStatus({ db, opsStatus });
  const security = getEnterpriseSecurityPosture({ governance, readiness });
  const goLiveRehearsal = input.goLiveRehearsal ?? getEnterpriseGoLiveRehearsal({
    teamId: input.teamId,
    deployment,
    readiness,
    opsStatus
  });
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
        `backupStatus=${opsStatus.backup.status}`,
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

export async function getEnterpriseCapabilityAuditWithPostgresEvidence(input: {
  teamId?: string;
  deployment?: SenaEnterpriseOrganizationDeploymentPackage;
  readiness?: SenaEnterpriseDeploymentReadiness;
  goLiveRehearsal?: SenaEnterpriseGoLiveRehearsal;
  governance?: SenaEnterpriseGovernanceStatus;
  opsStatus?: SenaEnterpriseOpsStatus;
  db?: SenaEnterpriseDb;
} = {}): Promise<SenaEnterpriseCapabilityAudit> {
  const db = input.db ?? (await readEnterpriseState()).db;
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const readiness = input.readiness ?? await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus });
  const deployment = input.deployment ?? await getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({
    teamId: input.teamId,
    readiness,
    opsStatus,
    db
  });
  const governance = input.governance ?? await getEnterpriseGovernanceStatusWithPostgresEvidence({ opsStatus });
  const goLiveRehearsal = input.goLiveRehearsal ?? await getEnterpriseGoLiveRehearsalWithPostgresEvidence({
    teamId: input.teamId,
    deployment,
    readiness,
    opsStatus,
    governance
  });
  return getEnterpriseCapabilityAudit({
    teamId: input.teamId,
    deployment,
    readiness,
    goLiveRehearsal,
    governance,
    opsStatus,
    db
  });
}
