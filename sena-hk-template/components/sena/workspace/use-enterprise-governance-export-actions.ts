"use client";

import { useCallback } from "react";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";

export type EnterpriseGovernanceExportActionsOptions = {
  activeEnterpriseTeamId: string;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
};

export function useEnterpriseGovernanceExportActions({
  activeEnterpriseTeamId,
  exportEnterpriseJsonArtifact
}: EnterpriseGovernanceExportActionsOptions) {
  const exportEnterpriseGovernanceHealthJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      SENA_WORKSPACE_API_ROUTES.enterprise.health,
      "sena-enterprise-governance-health.json",
      "Enterprise governance health"
    );
  }, [exportEnterpriseJsonArtifact]);

  const exportEnterpriseSecurityPostureJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      SENA_WORKSPACE_API_ROUTES.enterprise.security,
      "sena-enterprise-security-posture.json",
      "Enterprise security posture"
    );
  }, [exportEnterpriseJsonArtifact]);

  const exportEnterpriseOpsStatusJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      SENA_WORKSPACE_API_ROUTES.enterprise.opsStatus,
      "sena-enterprise-ops-status.json",
      "Enterprise ops status"
    );
  }, [exportEnterpriseJsonArtifact]);

  const exportEnterpriseOpsReadinessJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      SENA_WORKSPACE_API_ROUTES.enterprise.opsReadiness,
      "sena-enterprise-deployment-readiness.json",
      "Enterprise deployment readiness"
    );
  }, [exportEnterpriseJsonArtifact]);

  const exportEnterpriseDeploymentPackageJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.deployment, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-organization-deployment.json",
      "Enterprise deployment package"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseCapabilityAuditJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.capabilityAudit, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-capability-audit.json",
      "Enterprise capability audit"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseIdentityProductionEvidenceJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.identityProductionEvidence, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-identity-production-evidence.json",
      "Enterprise identity production evidence"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseNativeAdapterCertificationJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-native-adapter-certification.json",
      "Enterprise native adapter certification"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseSaasOperationsReadinessJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.saasOperations, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-saas-operations-readiness.json",
      "Enterprise SaaS operations readiness"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  return {
    exportEnterpriseCapabilityAuditJson,
    exportEnterpriseDeploymentPackageJson,
    exportEnterpriseGovernanceHealthJson,
    exportEnterpriseIdentityProductionEvidenceJson,
    exportEnterpriseNativeAdapterCertificationJson,
    exportEnterpriseOpsReadinessJson,
    exportEnterpriseOpsStatusJson,
    exportEnterpriseSaasOperationsReadinessJson,
    exportEnterpriseSecurityPostureJson
  };
}
