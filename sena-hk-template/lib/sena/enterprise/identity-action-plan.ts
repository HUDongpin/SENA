import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { artifactSha256 } from "./auth-config";
import type { SenaEnterpriseIdentityProductionEvidence } from "./identity-production-evidence";
import type { SenaEnterpriseIdentityPlatformDecisionRequestPacket } from "./identity-request-packet";
import type { SenaEnterpriseIdentityCutoverChecklist } from "./identity-submission-gates";
import type { SenaEnterpriseIdentityProductionDecisionId } from "./identity-readiness";
import type {
  SenaEnterpriseIdentityReceiptArchiveManifest,
  SenaEnterpriseIdentityReceiptArchiveMissingInput
} from "./identity-receipt-archive";
import type {
  SenaEnterprisePlatformDecisionEvidenceChecklistItem,
  SenaEnterprisePlatformDecisionEvidenceChecklistStatus
} from "./ops-platform-decision-policy";

export type SenaEnterpriseIdentityInstitutionActionLaneId =
  "institution-idp-owner" |
  "institution-provisioning-owner";

export type SenaEnterpriseIdentityInstitutionActionOwnerRole =
  "Institution IdP owner" |
  "Institution provisioning owner";

export type SenaEnterpriseIdentityActionPlanRotationEvidenceSpec = {
  id: string;
  decisionId: SenaEnterpriseIdentityProductionDecisionId;
};

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
    laneId: SenaEnterpriseIdentityInstitutionActionLaneId;
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

export const identityInstitutionActionLaneSpecs: Array<{
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

export function buildEnterpriseIdentitySubmissionMatrix(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  rotationFreshnessSpecs: SenaEnterpriseIdentityActionPlanRotationEvidenceSpec[];
  requestPacketPolicyHash: string;
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
    const rotationEvidence = input.rotationFreshnessSpecs
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
        requestPacketPolicyHash: request?.submissionTemplate.requestPacketPolicyHash ?? input.requestPacketPolicyHash
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

export const identityOwnerRunbookPreflightSpecs: Record<
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

export function buildEnterpriseIdentityOwnerRunbooks(input: {
  generatedAt: string;
  lanes: SenaEnterpriseIdentityInstitutionActionPlan["lanes"];
  submissionMatrix: SenaEnterpriseIdentitySubmissionMatrix;
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
  requestPacketPolicyHash: string;
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
        requestPacketPolicyHash: request?.submissionTemplate.requestPacketPolicyHash ?? input.requestPacketPolicyHash,
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

export function buildEnterpriseIdentityInstitutionActionPlan(input: {
  generatedAt: string;
  requirements: SenaEnterpriseIdentityProductionEvidence["requirements"];
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
  rotationFreshnessSpecs: SenaEnterpriseIdentityActionPlanRotationEvidenceSpec[];
  requestPacketPolicyHash: string;
}): SenaEnterpriseIdentityInstitutionActionPlan {
  const uniqueStrings = (values: string[]) => Array.from(new Set(values));
  const requestByDecision = new Map(input.platformRequestPacket.requests.map((request) => [request.decisionId, request]));
  const cutoverItemById = new Map(input.cutoverChecklist.items.map((item) => [item.id, item]));
  const receiptArchiveByDecision = new Map(input.receiptArchiveManifest.decisions.map((decision) => [decision.decisionId, decision]));
  const submissionMatrix = buildEnterpriseIdentitySubmissionMatrix({
    generatedAt: input.generatedAt,
    requirements: input.requirements,
    platformRequestPacket: input.platformRequestPacket,
    cutoverChecklist: input.cutoverChecklist,
    rotationFreshnessSpecs: input.rotationFreshnessSpecs,
    requestPacketPolicyHash: input.requestPacketPolicyHash
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
      laneId: spec.id,
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
    receiptArchiveManifest: input.receiptArchiveManifest,
    requestPacketPolicyHash: input.requestPacketPolicyHash
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
