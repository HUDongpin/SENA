import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  hasEnterprisePermission,
  requireEnterprisePermission
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseIdentityPlatformDecisionRequestPacket
} from "./identity-request-packet";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  identityEvidenceUrlHostBindingEvidence,
  identityEvidenceUrlHostBindingStatus,
  identityEvidenceUrlHostHashes,
} from "./identity-evidence-url-policy";
import {
  buildEnterpriseIdentityTechnicalEvidenceBinding,
  identityRotationFreshnessSpecs,
  identityTechnicalEvidenceBindingEvidence,
  identityTechnicalEvidenceBindingStatus,
  identityTechnicalReadinessStatus,
  isIdentityProductionDecisionId,
  normalizedProductionEvidenceIds,
  platformDecisionProductionEvidenceIdsByDecision,
  rotationFreshnessCheck,
  type SenaEnterpriseIdentityRotationFreshness,
  type SenaEnterpriseIdentityTechnicalEvidenceBinding
} from "./identity-readiness";
import {
  identityPlatformDecisionReceiptArchiveBodyPaths,
  identityPlatformDecisionResponseAuditHeaders,
  identityProductionEvidenceArtifactCompletenessStatus,
  identityProductionEvidenceArtifactDigestScope,
  identityReceiptAuditDigestScope,
  identityRequestPacketPolicyBinding,
  identitySubmittedEvidenceDigestScope,
  normalizeIdentityProductionEvidenceArtifactDigest,
  normalizeSubmittedIdentityRequestPacketPolicyHash,
  requireIdentityProductionEvidenceAppOrigin,
  requireIdentityProductionEvidenceEnvironment,
  requireIdentityProductionEvidenceFreeText,
  requireIdentityProductionEvidenceNotes,
  requireIdentityProductionEvidenceOwnerRole,
  requireIdentityProductionEvidenceUrl,
  requireIdentityProductionEvidenceUrlSecurity,
  requireIdentityProductionEvidenceVerifiedAt
} from "./identity-request-packet";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseOrganizationDeploymentDecision } from "./ops-deployment-decisions";
import {
  missingPlatformDecisionAcceptanceEvidence,
  platformDecisionEvidenceChecklist
} from "./ops-platform-decision-checklist";
import {
  isEnterprisePlatformDecisionAcceptanceStatus,
  isEnterprisePlatformDecisionId,
  isSelfManagedLocalPlatformDecision,
  normalizedPlatformDecisionEvidenceUrl,
  platformDecisionAcceptanceCriteria,
  platformDecisionAcceptedBridge,
  platformDecisionCategory,
  platformDecisionOwnerEvidence,
  platformDecisionProductionBlocking,
  requiredPlatformDecisionText,
  type SenaEnterprisePlatformDecisionAcceptanceStatus,
  type SenaEnterprisePlatformDecisionCategory,
  type SenaEnterprisePlatformDecisionEvidenceChecklistItem
} from "./ops-platform-decision-policy";
import {
  artifactSha256,
  envValue,
  now,
  sha256Text
} from "./ops-runtime";
import {
  readEnterpriseDb,
  saveDb
} from "./state";

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && hasEnterprisePermission(context, membership.teamId, "team:manage"))
    .map((membership) => membership.teamId);
}

export function latestPlatformDecisionAcceptances(
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

export function platformDecisionProductionEvidenceReceipt(
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

export function summarizePlatformDecisionAcceptances(
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

export function missingPlatformDecisionProductionEvidence(decision: SenaEnterprisePlatformDecisionRegisterDecision) {
  return decision.evidenceChecklist.filter((item) => item.productionRequired && item.status === "missing");
}

export function buildEnterprisePlatformDecisionRegister(
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
