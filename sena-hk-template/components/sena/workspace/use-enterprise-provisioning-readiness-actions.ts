"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { refreshEnterpriseProvisioningReadinessAction } from "./enterprise-ops-actions";
import type {
  EnterpriseIdentityProductionEvidenceDossier,
  EnterpriseOrganizationDeploymentPackage
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseProvisioningReadinessActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseDeploymentPackage: StateSetter<EnterpriseOrganizationDeploymentPackage | null>;
  setEnterpriseIdentityProductionEvidence: StateSetter<EnterpriseIdentityProductionEvidenceDossier | null>;
};

export function useEnterpriseProvisioningReadinessActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseDeploymentPackage,
  setEnterpriseIdentityProductionEvidence
}: EnterpriseProvisioningReadinessActionsOptions) {
  const refreshEnterpriseProvisioningReadiness = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!enterpriseUserPresent) {
      if (!options.silent) setEnterpriseMessage("Sign in before refreshing provisioning and SCIM readiness.");
      return null;
    }
    if (!options.silent) setEnterpriseBusy(true);
    try {
      const { deployment, identityEvidence } = await refreshEnterpriseProvisioningReadinessAction({
        teamId: activeEnterpriseTeamId || undefined
      });
      setEnterpriseDeploymentPackage(deployment);
      setEnterpriseIdentityProductionEvidence(identityEvidence);
      const endpointCount = deployment.serviceEndpoints.filter((endpoint) => endpoint.id === "provisioning" || endpoint.id.startsWith("scim-")).length;
      const envEntries = deployment.env.filter((entry) => entry.category === "provisioning" || entry.category === "identity");
      const configuredEnv = envEntries.filter((entry) => entry.configured).length;
      if (!options.silent) {
        setEnterpriseMessage(`Provisioning readiness ${deployment.status}: identity evidence ${deployment.summary.identityProductionStatus}, identity verifier ${deployment.summary.identitySubmissionVerifierIncomplete} incomplete, secret rotation ${deployment.summary.identityRotationFreshness}, ${identityEvidence.platformRequestPacket.summary.blockingRequests} identity request blockers, ${configuredEnv}/${envEntries.length} env configured, ${endpointCount} SCIM/provisioning endpoints, ${deployment.summary.openPlatformDecisions} open platform decisions.`);
      }
      return { deployment, identityEvidence };
    } catch (error) {
      if (!options.silent) setEnterpriseMessage(error instanceof Error ? error.message : "Provisioning readiness refresh failed.");
      return null;
    } finally {
      if (!options.silent) setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseDeploymentPackage,
    setEnterpriseIdentityProductionEvidence,
    setEnterpriseMessage
  ]);

  return {
    refreshEnterpriseProvisioningReadiness
  };
}
