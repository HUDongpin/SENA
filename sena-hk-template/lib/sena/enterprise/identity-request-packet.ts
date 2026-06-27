import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import {
  artifactSha256,
  configuredSenaAppOrigin,
  isLocalOrPrivateIdentityEvidenceHost,
  isReservedIdentityEvidenceHost
} from "./auth-config";
import type { SenaEnterpriseOrganizationDeploymentDecision } from "./ops-deployment-decisions";
import type { SenaEnterprisePlatformDecisionAcceptance } from "./ops-platform-decisions";
import type { SenaEnterprisePlatformDecisionAcceptanceStatus } from "./ops-platform-decision-policy";
import {
  identityEvidenceAllowedHostConfig,
  identityEvidenceAllowedHostEvidence,
  identityEvidenceHostAllowed,
  identityEvidenceUrlHasSpecificEvidencePath,
  identityEvidenceUrlPolicy,
  identityEvidenceUrlRejectedSensitiveQueryParameters,
  identityProductionEvidenceFreeTextPolicy,
  identityProductionEvidenceFreeTextSecretCarriers,
  identityProductionEvidenceNoteSecretCarriers,
  identityProductionEvidenceNotesPolicy
} from "./identity-evidence-url-policy";
import {
  buildEnterpriseIdentityTechnicalEvidenceBinding,
  identityProductionDecisionIds,
  identityRotationFreshnessPolicy,
  identityRotationFreshnessSpecs,
  isIdentityProductionDecisionId,
  platformDecisionProductionEvidenceIdsByDecision,
  type SenaEnterpriseIdentityProductionDecisionId,
  type SenaEnterpriseIdentityRotationFreshness,
  type SenaEnterpriseIdentityTechnicalEvidenceBinding
} from "./identity-readiness";
import type { SenaEnterpriseIdentityProductionEvidence } from "./identity-production-evidence";

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

export const identityPlatformDecisionSubmissionRequiredBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["requiredBodyFields"] = [
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

export const identityProductionEvidenceSubmissionBodyFields: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["identityProductionEvidenceBodyFields"] = [
  "evidenceUrl",
  "productionEvidenceIds",
  "productionEvidenceArtifactDigest",
  "productionEvidenceVerifiedAt",
  "requestPacketPolicyHash"
];

export const identityReceiptAuditDigestScope = "current-validation-snapshot" as const;
export const identitySubmittedEvidenceDigestScope = "platform-submission-inputs" as const;
export const identityProductionEvidenceArtifactDigestScope = "external-evidence-artifact" as const;
export const identityProductionEvidenceArtifactDigestResponseHeader = "x-sena-identity-production-evidence-artifact-digest" as const;
export const identityProductionEvidenceArtifactCoveredIdsResponseHeader = "x-sena-identity-production-evidence-artifact-covered-ids" as const;
export const identityProductionEvidenceArtifactCoverageResponseHeader = "x-sena-identity-production-evidence-artifact-coverage" as const;
export const identityProductionEvidenceArtifactCompletenessResponseHeader = "x-sena-identity-production-evidence-artifact-completeness" as const;
export const identityStableSubmissionDigestInputFields = [
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

export const identityPlatformDecisionResponseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"] = [
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

export const identityPlatformDecisionReceiptArchiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"] = [
  "acceptance.productionEvidenceReceipt",
  "identityProductionEvidence.submissionVerifier",
  "identityProductionEvidence.cutoverChecklist",
  "identityProductionEvidence.platformRequestPacket",
  "identityProductionEvidence.receiptArchiveManifest",
  "identityProductionEvidence.institutionActionPlan"
];

export const identityPlatformDecisionReceiptArchivePolicy: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"] = {
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

export function isIdentityProductionEvidenceEnvironment(environment: string) {
  const tokens = environment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hasProductionToken = tokens.includes("production") || tokens.includes("prod");
  const nonProductionTokens = new Set(["local", "dev", "development", "test", "testing", "staging", "sandbox", "mock", "demo", "preview", "non"]);
  return hasProductionToken && !tokens.some((token) => nonProductionTokens.has(token));
}

export function requireIdentityProductionEvidenceEnvironment(
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

export const identityProductionOwnerRolePolicy: {
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

export const genericIdentityProductionOwnerNames = new Set([
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

export function requireIdentityProductionEvidenceOwnerRole(
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

export function requireIdentityProductionEvidenceVerifiedAt(
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

export function normalizeIdentityProductionEvidenceArtifactDigest(
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

export function requireIdentityProductionEvidenceNotes(
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

export function requireIdentityProductionEvidenceFreeText(
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

export function requireIdentityProductionEvidenceUrlSecurity(decisionId: string, evidenceUrl: string | undefined) {
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

export function requireIdentityProductionEvidenceUrl(decisionId: string, evidenceUrl: string | undefined, productionEvidenceIds: string[]) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  if (!evidenceUrl) {
    throw new SenaEnterpriseError(
      "Identity production evidence ids require an institution evidence URL before institution IdP or provisioning evidence can be accepted.",
      400,
      "missing_identity_production_evidence_url"
    );
  }
}

export function requireIdentityProductionEvidenceAppOrigin(decisionId: string, productionEvidenceIds: string[]) {
  if (!isIdentityProductionDecisionId(decisionId) || productionEvidenceIds.length === 0) return;
  configuredSenaAppOrigin({ required: true });
}

export function identityProductionEvidenceArtifactCompletenessStatus(
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

export function identityProductionArtifactDigestRequiredEvidenceIds() {
  return identityProductionDecisionIds.flatMap((decisionId) =>
    platformDecisionProductionEvidenceIdsByDecision[decisionId] ?? []
  );
}

export function identityProductionEvidenceArtifactDigestSubmissionPolicy(): SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["productionEvidenceArtifactDigestPolicy"] {
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

export function identityProductionEvidenceArtifactDigestTemplatePolicy(
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

export function identityRequestPacketPolicyAnchor() {
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

export function identityRequestPacketPolicyHash() {
  return artifactSha256(identityRequestPacketPolicyAnchor());
}

export function normalizeSubmittedIdentityRequestPacketPolicyHash(
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

export function identityRequestPacketPolicyBinding(acceptance: Pick<
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

export function buildEnterpriseIdentityPlatformDecisionRequestPacket(input: {
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
