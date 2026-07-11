import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  identityProductionDecisionIds,
  type SenaEnterpriseIdentityProductionDecisionId
} from "./identity-readiness";
import type { SenaEnterpriseIdentityProductionEvidence } from "./identity-production-evidence";
import {
  isSelfManagedEnterpriseMode,
  selfManagedIdentityNextAction
} from "./ops-platform-decision-policy";
import { formatIdentityReceiptArchiveArtifactCompletenessCounts } from "./identity-receipt-archive";

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

export function buildEnterpriseIdentitySubmissionVerifier(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"];
  requestPacketPolicyHash: string;
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
  const requestPacketPolicyHash = input.requestPacketPolicyHash;
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

export const identityCutoverChecklistSpecs: Array<{
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

export function buildEnterpriseIdentityCutoverChecklist(input: {
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
