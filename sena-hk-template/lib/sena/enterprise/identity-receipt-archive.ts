import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { artifactSha256 } from "./auth-config";
import type {
  SenaEnterpriseIdentityPlatformDecisionRequestPacket
} from "./identity-request-packet";
import type {
  SenaEnterpriseIdentityProductionDecisionId,
  SenaEnterpriseIdentityRotationFreshness
} from "./identity-readiness";
import type { SenaEnterprisePlatformDecisionProductionEvidenceReceipt } from "./ops-platform-decisions";

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

export type SenaEnterpriseIdentityReceiptArchiveAcceptanceReceipt = {
  decisionId: SenaEnterpriseIdentityProductionDecisionId;
  productionEvidenceReceipt?: SenaEnterprisePlatformDecisionProductionEvidenceReceipt;
};

type SenaEnterpriseIdentityReceiptArchiveSnapshot = {
  receiptArchiveManifest: {
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
      "missingArchiveInputs"
    >>;
  };
};

export const identityReceiptArchiveMissingInputOrder: SenaEnterpriseIdentityReceiptArchiveMissingInput[] = [
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

export const identityReceiptArchiveArtifactCompletenessOrder = ["complete", "partial", "missing"] as const;

const identityReceiptArchiveDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [
  "institution-idp-approval",
  "institution-provisioning-owner"
];

export function summarizeIdentityReceiptArchiveMissingInputs(
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

export function formatIdentityReceiptArchiveMissingInputCounts(
  counts: Partial<Record<SenaEnterpriseIdentityReceiptArchiveMissingInput, number>>
) {
  const summary = identityReceiptArchiveMissingInputOrder
    .filter((missingInput) => counts[missingInput])
    .map((missingInput) => `${missingInput}:${counts[missingInput]}`);
  return summary.join("|") || "none";
}

export function summarizeIdentityReceiptArchiveArtifactCompleteness(
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

export function formatIdentityReceiptArchiveArtifactCompletenessCounts(
  counts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>>
) {
  return identityReceiptArchiveArtifactCompletenessOrder
    .map((status) => `${status}:${counts[status] ?? 0}`)
    .join("|");
}

export function identityReceiptArchiveArtifactCompletenessReady(
  counts: Partial<Record<(typeof identityReceiptArchiveArtifactCompletenessOrder)[number], number>>
) {
  return (counts.complete ?? 0) === identityReceiptArchiveDecisionIds.length &&
    (counts.partial ?? 0) === 0 &&
    (counts.missing ?? 0) === 0;
}

export function latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(
  snapshot?: SenaEnterpriseIdentityReceiptArchiveSnapshot
) {
  return snapshot
    ? formatIdentityReceiptArchiveArtifactCompletenessCounts(snapshot.receiptArchiveManifest.summary.artifactCompletenessCounts)
    : "missing";
}

export function latestReleaseGateIdentityReceiptArchiveEvidence(
  snapshot?: SenaEnterpriseIdentityReceiptArchiveSnapshot,
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

export function identityReceiptArchiveDecisionAuditSummaries(
  snapshot?: SenaEnterpriseIdentityReceiptArchiveSnapshot
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

export function buildEnterpriseIdentityReceiptArchiveManifest(input: {
  generatedAt: string;
  acceptanceReceipts: SenaEnterpriseIdentityReceiptArchiveAcceptanceReceipt[];
  receiptArchivePolicy: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"];
  responseAuditHeaders: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["responseAuditHeaders"];
  receiptArchiveBodyPaths: SenaEnterpriseIdentityPlatformDecisionRequestPacket["submission"]["receiptArchivePolicy"]["archiveBodyPaths"];
  selfManagedEnterpriseMode: boolean;
}): SenaEnterpriseIdentityReceiptArchiveManifest {
  if (input.selfManagedEnterpriseMode) {
    const decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"] = identityReceiptArchiveDecisionIds.map((decisionId) => ({
      decisionId,
      archiveStatus: "ready-for-archive",
      receiptVerifierStatus: "ready",
      digestHeader: input.receiptArchivePolicy.digestHeader,
      stableSubmissionDigestHeader: input.receiptArchivePolicy.stableSubmissionDigestHeader,
      productionEvidenceArtifactDigestCompletenessStatus: "complete",
      responseAuditHeaders: input.responseAuditHeaders,
      archiveBodyPaths: input.receiptArchiveBodyPaths,
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
      archivePolicy: input.receiptArchivePolicy,
      summary: {
        decisions: decisions.length,
        readyForArchive: decisions.length,
        reviewArchives: 0,
        missingReceipts: 0,
        missingArchiveInputCounts: {},
        artifactCompletenessCounts,
        digestHeader: input.receiptArchivePolicy.digestHeader,
        stableSubmissionDigestHeader: input.receiptArchivePolicy.stableSubmissionDigestHeader,
        archiveBodyPaths: input.receiptArchiveBodyPaths
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
  const decisions: SenaEnterpriseIdentityReceiptArchiveManifest["decisions"] = identityReceiptArchiveDecisionIds.map((decisionId) => {
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
      digestHeader: input.receiptArchivePolicy.digestHeader,
      ...(receipt?.receiptAuditDigest ? { receiptAuditDigest: receipt.receiptAuditDigest } : {}),
      ...(receipt?.receiptAuditDigestScope ? { receiptAuditDigestScope: receipt.receiptAuditDigestScope } : {}),
      stableSubmissionDigestHeader: input.receiptArchivePolicy.stableSubmissionDigestHeader,
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
      responseAuditHeaders: input.responseAuditHeaders,
      archiveBodyPaths: input.receiptArchiveBodyPaths,
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
    archivePolicy: input.receiptArchivePolicy,
    summary: {
      decisions: decisions.length,
      readyForArchive,
      reviewArchives,
      missingReceipts,
      missingArchiveInputCounts,
      artifactCompletenessCounts,
      digestHeader: input.receiptArchivePolicy.digestHeader,
      stableSubmissionDigestHeader: input.receiptArchivePolicy.stableSubmissionDigestHeader,
      archiveBodyPaths: input.receiptArchiveBodyPaths
    },
    decisions,
    evidence: [
      "schema=sena-enterprise-identity-receipt-archive-manifest/v1",
      `receiptArchiveReadyForArchive=${readyForArchive}`,
      `receiptArchiveReview=${reviewArchives}`,
      `receiptArchiveMissingReceipts=${missingReceipts}`,
      `receiptArchiveMissingInputs=${missingArchiveInputSummary}`,
      `receiptArchiveArtifactCompleteness=${artifactCompletenessSummary}`,
      `receiptArchiveDigestHeader=${input.receiptArchivePolicy.digestHeader}`,
      `receiptArchiveStableDigestHeader=${input.receiptArchivePolicy.stableSubmissionDigestHeader}`,
      `receiptArchiveHeaders=${input.responseAuditHeaders.join("|")}`,
      `receiptArchiveBodyPaths=${input.receiptArchiveBodyPaths.join("|")}`,
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
