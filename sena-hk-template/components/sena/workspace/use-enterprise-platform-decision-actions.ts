"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import { submitEnterprisePlatformDecisionReviewAction } from "./enterprise-ops-actions";
import type {
  EnterpriseIdentityPlatformDecisionRequestPacket,
  EnterpriseIdentityProductionEvidenceDossier,
  EnterprisePlatformDecisionId,
  EnterprisePlatformDecisionStatus
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterprisePlatformDecisionActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  platformDecisionId: EnterprisePlatformDecisionId;
  platformDecisionStatus: EnterprisePlatformDecisionStatus;
  platformDecisionAcceptBridge: boolean;
  platformDecisionOwnerName: string;
  platformDecisionOwnerRole: string;
  platformDecisionEnvironment: string;
  platformDecisionEvidenceUrl: string;
  platformDecisionProductionEvidenceIds: string[];
  platformDecisionProductionEvidenceVerifiedAt: string;
  platformDecisionNotes: string;
  platformDecisionRequiresIdentityEvidenceUrl: boolean;
  platformDecisionRequiresIdentityEvidenceTimestamp: boolean;
  platformRequestPacket: EnterpriseIdentityPlatformDecisionRequestPacket | null;
  platformRequestPacketPolicyHash?: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  refreshEnterprisePlatformDecisionState: (teamId?: string) => Promise<unknown>;
  refreshEnterpriseProvisioningReadiness: (options?: { silent?: boolean }) => Promise<unknown>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseIdentityProductionEvidence: StateSetter<EnterpriseIdentityProductionEvidenceDossier | null>;
  setPlatformDecisionId: StateSetter<EnterprisePlatformDecisionId>;
  setPlatformDecisionStatus: StateSetter<EnterprisePlatformDecisionStatus>;
  setPlatformDecisionAcceptBridge: StateSetter<boolean>;
  setPlatformDecisionOwnerName: StateSetter<string>;
  setPlatformDecisionOwnerRole: StateSetter<string>;
  setPlatformDecisionEnvironment: StateSetter<string>;
  setPlatformDecisionEvidenceUrl: StateSetter<string>;
  setPlatformDecisionProductionEvidenceIds: StateSetter<string[]>;
  setPlatformDecisionProductionEvidenceVerifiedAt: StateSetter<string>;
  setPlatformDecisionNotes: StateSetter<string>;
};

export function useEnterprisePlatformDecisionActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  platformDecisionId,
  platformDecisionStatus,
  platformDecisionAcceptBridge,
  platformDecisionOwnerName,
  platformDecisionOwnerRole,
  platformDecisionEnvironment,
  platformDecisionEvidenceUrl,
  platformDecisionProductionEvidenceIds,
  platformDecisionProductionEvidenceVerifiedAt,
  platformDecisionNotes,
  platformDecisionRequiresIdentityEvidenceUrl,
  platformDecisionRequiresIdentityEvidenceTimestamp,
  platformRequestPacket,
  platformRequestPacketPolicyHash,
  enterpriseJsonHeaders,
  exportEnterpriseJsonArtifact,
  refreshEnterprisePlatformDecisionState,
  refreshEnterpriseProvisioningReadiness,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseIdentityProductionEvidence,
  setPlatformDecisionId,
  setPlatformDecisionStatus,
  setPlatformDecisionAcceptBridge,
  setPlatformDecisionOwnerName,
  setPlatformDecisionOwnerRole,
  setPlatformDecisionEnvironment,
  setPlatformDecisionEvidenceUrl,
  setPlatformDecisionProductionEvidenceIds,
  setPlatformDecisionProductionEvidenceVerifiedAt,
  setPlatformDecisionNotes
}: EnterprisePlatformDecisionActionsOptions) {
  const exportEnterprisePlatformDecisionRegisterJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-platform-decision-register.json",
      "Enterprise platform decision register"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const submitEnterprisePlatformDecisionReview = useCallback(async () => {
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording platform decisions.");
      return;
    }
    if (!platformDecisionOwnerName.trim() || !platformDecisionOwnerRole.trim() || !platformDecisionEnvironment.trim() || !platformDecisionNotes.trim()) {
      setEnterpriseMessage("Add owner, role, environment, and notes before recording a platform decision.");
      return;
    }
    const platformDecisionEvidenceUrlValue = platformDecisionEvidenceUrl.trim();
    if (platformDecisionRequiresIdentityEvidenceUrl && !platformDecisionEvidenceUrlValue) {
      setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
      return;
    }
    if (platformDecisionRequiresIdentityEvidenceUrl) {
      let platformDecisionEvidenceUrlParsed: URL;
      try {
        platformDecisionEvidenceUrlParsed = new URL(platformDecisionEvidenceUrlValue);
      } catch {
        setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
        return;
      }
      if (platformDecisionEvidenceUrlParsed.protocol !== "https:") {
        setEnterpriseMessage("Add an institution HTTPS evidence URL before recording identity production evidence.");
        return;
      }
      const platformDecisionSensitiveQueryParameterNames = new Set(
        (platformRequestPacket?.submission.evidenceUrlPolicy.rejectedSensitiveQueryParameters ?? [])
          .map((parameter) => parameter.trim().toLowerCase())
      );
      const platformDecisionRejectedSensitiveQueryParameters = Array.from(platformDecisionEvidenceUrlParsed.searchParams.keys())
        .map((parameter) => parameter.trim().toLowerCase())
        .filter((parameter) => platformDecisionSensitiveQueryParameterNames.has(parameter));
      if (
        platformDecisionEvidenceUrlParsed.username ||
        platformDecisionEvidenceUrlParsed.password ||
        platformDecisionEvidenceUrlParsed.hash ||
        platformDecisionRejectedSensitiveQueryParameters.length > 0
      ) {
        setEnterpriseMessage("Evidence URL must not include embedded credentials, fragments, or sensitive query parameters.");
        return;
      }
    }
    const productionEvidenceVerifiedAtValue = platformDecisionProductionEvidenceVerifiedAt.trim();
    if (platformDecisionRequiresIdentityEvidenceTimestamp && !productionEvidenceVerifiedAtValue) {
      setEnterpriseMessage("Add a production evidence verified-at timestamp before recording identity production evidence.");
      return;
    }
    const productionEvidenceVerifiedAtMs = productionEvidenceVerifiedAtValue ? Date.parse(productionEvidenceVerifiedAtValue) : Number.NaN;
    if (productionEvidenceVerifiedAtValue && !Number.isFinite(productionEvidenceVerifiedAtMs)) {
      setEnterpriseMessage("Add a valid production evidence verified-at timestamp before recording platform evidence.");
      return;
    }
    if (productionEvidenceVerifiedAtMs > Date.now()) {
      setEnterpriseMessage("Production evidence verified-at cannot be in the future.");
      return;
    }
    const productionEvidenceVerifiedAtIso = productionEvidenceVerifiedAtValue
      ? new Date(productionEvidenceVerifiedAtMs).toISOString()
      : undefined;
    const requestPacketPolicyHash = platformDecisionStatus === "accepted" && platformDecisionProductionEvidenceIds.length > 0
      ? platformRequestPacketPolicyHash
      : undefined;
    if (platformDecisionStatus === "accepted" && platformDecisionProductionEvidenceIds.length > 0 && !requestPacketPolicyHash) {
      setEnterpriseMessage("Load the current identity request packet before recording identity production evidence.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await submitEnterprisePlatformDecisionReviewAction(
        {
          teamId: activeEnterpriseTeamId,
          decisionId: platformDecisionId,
          status: platformDecisionStatus,
          acceptedBridge: platformDecisionStatus === "accepted" && platformDecisionAcceptBridge,
          ownerName: platformDecisionOwnerName,
          ownerRole: platformDecisionOwnerRole,
          environment: platformDecisionEnvironment,
          evidenceUrl: platformDecisionEvidenceUrlValue || undefined,
          productionEvidenceIds: platformDecisionStatus === "accepted" ? platformDecisionProductionEvidenceIds : [],
          productionEvidenceVerifiedAt: productionEvidenceVerifiedAtIso,
          requestPacketPolicyHash,
          notes: platformDecisionNotes
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setPlatformDecisionEvidenceUrl("");
      setPlatformDecisionProductionEvidenceIds([]);
      setPlatformDecisionProductionEvidenceVerifiedAt("");
      setPlatformDecisionNotes("");
      if (payload.platformDecisionRegister || payload.acceptance) {
        if (payload.identityProductionEvidence?.schemaVersion === SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence) {
          setEnterpriseIdentityProductionEvidence(payload.identityProductionEvidence as EnterpriseIdentityProductionEvidenceDossier);
        }
        await refreshEnterprisePlatformDecisionState(activeEnterpriseTeamId);
        await refreshEnterpriseProvisioningReadiness({ silent: true });
      }
      const missingProductionEvidenceIds = Array.isArray(payload.acceptance?.productionEvidenceReceipt?.missingEvidenceIds)
        ? payload.acceptance.productionEvidenceReceipt.missingEvidenceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [];
      const productionEvidenceReceiptMessage = missingProductionEvidenceIds.length > 0
        ? ` Missing production evidence: ${missingProductionEvidenceIds.join(", ")}.`
        : "";
      const identityProductionEvidenceMessage = payload.identityProductionEvidence?.schemaVersion === SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence
        ? ` identity verifier ${payload.identityProductionEvidence.submissionVerifier.summary.incompleteDecisions} incomplete · identity blockers ${payload.identityProductionEvidence.platformRequestPacket.summary.blockingRequests}.`
        : "";
      setEnterpriseMessage(`Platform decision recorded: ${payload.acceptance?.decisionId ?? platformDecisionId} · ${payload.acceptance?.status ?? platformDecisionStatus}.${productionEvidenceReceiptMessage}${identityProductionEvidenceMessage}`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Platform decision review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    platformDecisionAcceptBridge,
    platformDecisionEnvironment,
    platformDecisionEvidenceUrl,
    platformDecisionId,
    platformDecisionNotes,
    platformDecisionOwnerName,
    platformDecisionOwnerRole,
    platformDecisionProductionEvidenceIds,
    platformDecisionProductionEvidenceVerifiedAt,
    platformDecisionRequiresIdentityEvidenceTimestamp,
    platformDecisionRequiresIdentityEvidenceUrl,
    platformDecisionStatus,
    platformRequestPacket,
    platformRequestPacketPolicyHash,
    refreshEnterprisePlatformDecisionState,
    refreshEnterpriseProvisioningReadiness,
    setEnterpriseBusy,
    setEnterpriseIdentityProductionEvidence,
    setEnterpriseMessage,
    setPlatformDecisionEvidenceUrl,
    setPlatformDecisionNotes,
    setPlatformDecisionProductionEvidenceIds,
    setPlatformDecisionProductionEvidenceVerifiedAt
  ]);

  const applyEnterpriseIdentityRequestToPlatformDecision = useCallback((
    request: EnterpriseIdentityPlatformDecisionRequestPacket["requests"][number]
  ) => {
    setPlatformDecisionId(request.decisionId as EnterprisePlatformDecisionId);
    setPlatformDecisionStatus("accepted");
    setPlatformDecisionAcceptBridge(true);
    setPlatformDecisionOwnerName("");
    setPlatformDecisionOwnerRole(request.submissionTemplate.ownerRolePlaceholder);
    setPlatformDecisionEnvironment(request.submissionTemplate.environmentPlaceholder);
    setPlatformDecisionEvidenceUrl("");
    setPlatformDecisionProductionEvidenceIds(request.submissionTemplate.productionEvidenceIds);
    setPlatformDecisionProductionEvidenceVerifiedAt("");
    setPlatformDecisionNotes(request.submissionTemplate.notesTemplate);
    setEnterpriseMessage(`Loaded ${request.decisionId} identity request into the platform decision form. Enter the named institution identity platform owner, then paste the institution-owned HTTPS evidence URL and production verified-at timestamp before recording.`);
  }, [
    setEnterpriseMessage,
    setPlatformDecisionAcceptBridge,
    setPlatformDecisionEnvironment,
    setPlatformDecisionEvidenceUrl,
    setPlatformDecisionId,
    setPlatformDecisionNotes,
    setPlatformDecisionOwnerName,
    setPlatformDecisionOwnerRole,
    setPlatformDecisionProductionEvidenceIds,
    setPlatformDecisionProductionEvidenceVerifiedAt,
    setPlatformDecisionStatus
  ]);

  return {
    applyEnterpriseIdentityRequestToPlatformDecision,
    exportEnterprisePlatformDecisionRegisterJson,
    submitEnterprisePlatformDecisionReview
  };
}
