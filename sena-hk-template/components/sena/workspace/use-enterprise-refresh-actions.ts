"use client";

import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  getEnterpriseAnalysisRunsAction,
  getEnterpriseImportRunsAction,
  getEnterpriseProjectsAction,
  logoutEnterpriseSessionAction,
  revokeEnterpriseSessionAction
} from "./enterprise-actions";
import {
  buildSenaWorkspaceApiUrl,
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import type {
  EnterpriseAnalysisRun,
  EnterpriseClaimEvidencePackage,
  EnterpriseCollaborationState,
  EnterpriseContext,
  EnterpriseIdentityProductionEvidenceDossier,
  EnterpriseImportRun,
  EnterpriseMfaSetup,
  EnterpriseMfaStatus,
  EnterpriseOrganizationDeploymentPackage,
  EnterprisePlatformDecisionState,
  EnterpriseProjectSummary,
  EnterpriseReleaseGateState,
  EnterpriseSessionList,
  EnterpriseSsoPreflight,
  EnterpriseTeamState,
  EnterpriseUploadStorageState
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseRefreshActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseSessionList: EnterpriseSessionList | null;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  resetEnterpriseCsrfToken: () => void;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseContext: StateSetter<EnterpriseContext | null>;
  setEnterpriseProjects: StateSetter<EnterpriseProjectSummary[]>;
  setEnterpriseTeamState: StateSetter<EnterpriseTeamState | null>;
  setEnterpriseUploadStorage: StateSetter<EnterpriseUploadStorageState | null>;
  setEnterpriseMfaStatus: StateSetter<EnterpriseMfaStatus | null>;
  setEnterpriseMfaSetup: StateSetter<EnterpriseMfaSetup | null>;
  setEnterpriseSessionList: StateSetter<EnterpriseSessionList | null>;
  setEnterpriseSsoPreflight: StateSetter<EnterpriseSsoPreflight | null>;
  setEnterpriseDeploymentPackage: StateSetter<EnterpriseOrganizationDeploymentPackage | null>;
  setEnterpriseIdentityProductionEvidence: StateSetter<EnterpriseIdentityProductionEvidenceDossier | null>;
  setEnterpriseImportRuns: StateSetter<EnterpriseImportRun[]>;
  setEnterpriseAnalysisRuns: StateSetter<EnterpriseAnalysisRun[]>;
  setActiveEnterpriseProjectId: StateSetter<string>;
  setEnterpriseCollaboration: StateSetter<EnterpriseCollaborationState | null>;
  setEnterpriseClaimPackage: StateSetter<EnterpriseClaimEvidencePackage | null>;
  setEnterprisePlatformDecisionState: StateSetter<EnterprisePlatformDecisionState | null>;
  setEnterpriseReleaseGateState: StateSetter<EnterpriseReleaseGateState | null>;
};

export function useEnterpriseRefreshActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseSessionList,
  enterpriseJsonHeaders,
  resetEnterpriseCsrfToken,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseContext,
  setEnterpriseProjects,
  setEnterpriseTeamState,
  setEnterpriseUploadStorage,
  setEnterpriseMfaStatus,
  setEnterpriseMfaSetup,
  setEnterpriseSessionList,
  setEnterpriseSsoPreflight,
  setEnterpriseDeploymentPackage,
  setEnterpriseIdentityProductionEvidence,
  setEnterpriseImportRuns,
  setEnterpriseAnalysisRuns,
  setActiveEnterpriseProjectId,
  setEnterpriseCollaboration,
  setEnterpriseClaimPackage,
  setEnterprisePlatformDecisionState,
  setEnterpriseReleaseGateState
}: EnterpriseRefreshActionsOptions) {
  const refreshEnterpriseTeamState = useCallback(async () => {
    const payload = await requestSenaWorkspaceJson<EnterpriseTeamState>(
      SENA_WORKSPACE_API_ROUTES.enterprise.team,
      undefined,
      { errorMessage: "Could not load team state." }
    );
    setEnterpriseTeamState(payload);
    return payload;
  }, [setEnterpriseTeamState]);

  const refreshEnterpriseMfaState = useCallback(async () => {
    const payload = await requestSenaWorkspaceJson<EnterpriseMfaStatus>(
      SENA_WORKSPACE_API_ROUTES.auth.mfa,
      undefined,
      { errorMessage: "Could not load MFA status." }
    );
    setEnterpriseMfaStatus(payload);
    return payload;
  }, [setEnterpriseMfaStatus]);

  const refreshEnterpriseSessionList = useCallback(async () => {
    const payload = await requestSenaWorkspaceJson<EnterpriseSessionList>(
      SENA_WORKSPACE_API_ROUTES.auth.sessions,
      undefined,
      { errorMessage: "Could not load sessions." }
    );
    setEnterpriseSessionList(payload);
    return payload;
  }, [setEnterpriseSessionList]);

  const refreshEnterprisePlatformDecisionState = useCallback(async (teamId = activeEnterpriseTeamId) => {
    if (!teamId) {
      setEnterprisePlatformDecisionState(null);
      return null;
    }
    const payload = await requestSenaWorkspaceJson<EnterprisePlatformDecisionState>(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions, { teamId }),
      undefined,
      { errorMessage: "Could not load platform decisions." }
    );
    setEnterprisePlatformDecisionState(payload);
    return payload;
  }, [activeEnterpriseTeamId, setEnterprisePlatformDecisionState]);

  const refreshEnterpriseReleaseGateReviews = useCallback(async (teamId = activeEnterpriseTeamId) => {
    if (!teamId) {
      setEnterpriseReleaseGateState(null);
      return null;
    }
    const payload = await requestSenaWorkspaceJson<EnterpriseReleaseGateState>(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate, { teamId }),
      undefined,
      { errorMessage: "Could not load release gate reviews." }
    );
    setEnterpriseReleaseGateState(payload);
    return payload;
  }, [activeEnterpriseTeamId, setEnterpriseReleaseGateState]);

  const clearEnterpriseSessionState = useCallback(() => {
    setEnterpriseContext(null);
    setEnterpriseProjects([]);
    setEnterpriseTeamState(null);
    setEnterpriseUploadStorage(null);
    setEnterpriseMfaStatus(null);
    setEnterpriseMfaSetup(null);
    setEnterpriseSessionList(null);
    setEnterpriseSsoPreflight(null);
    setEnterpriseDeploymentPackage(null);
    setEnterpriseIdentityProductionEvidence(null);
    setEnterpriseImportRuns([]);
    setEnterpriseAnalysisRuns([]);
    setActiveEnterpriseProjectId("");
    setEnterpriseCollaboration(null);
    setEnterpriseClaimPackage(null);
    setEnterprisePlatformDecisionState(null);
    setEnterpriseReleaseGateState(null);
  }, [
    setActiveEnterpriseProjectId,
    setEnterpriseAnalysisRuns,
    setEnterpriseClaimPackage,
    setEnterpriseCollaboration,
    setEnterpriseContext,
    setEnterpriseDeploymentPackage,
    setEnterpriseIdentityProductionEvidence,
    setEnterpriseImportRuns,
    setEnterpriseMfaSetup,
    setEnterpriseMfaStatus,
    setEnterprisePlatformDecisionState,
    setEnterpriseProjects,
    setEnterpriseReleaseGateState,
    setEnterpriseSessionList,
    setEnterpriseSsoPreflight,
    setEnterpriseTeamState,
    setEnterpriseUploadStorage
  ]);

  const logoutEnterpriseSessionFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("No active enterprise session is signed in.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      await logoutEnterpriseSessionAction({ jsonHeaders: enterpriseJsonHeaders });
      resetEnterpriseCsrfToken();
      clearEnterpriseSessionState();
      setEnterpriseMessage("Signed out of the SENA enterprise runtime.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise logout failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    clearEnterpriseSessionState,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    resetEnterpriseCsrfToken,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  const revokeEnterpriseSession = useCallback(async (sessionId?: string, action?: "revoke-others") => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before managing sessions.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await revokeEnterpriseSessionAction(
        action ? { action } : { sessionId },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setEnterpriseSessionList({
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionList,
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        currentSessionId: enterpriseSessionList?.currentSessionId ?? "",
        sessionDays: enterpriseSessionList?.sessionDays ?? 0,
        sessionPolicy: enterpriseSessionList?.sessionPolicy,
        sessions: payload.remainingSessions ?? []
      });
      setEnterpriseMessage(`Revoked ${payload.revokedCount ?? 0} session${payload.revokedCount === 1 ? "" : "s"}.`);
      await refreshEnterpriseSessionList();
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Session revoke failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    enterpriseSessionList,
    enterpriseUserPresent,
    refreshEnterpriseSessionList,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseSessionList
  ]);

  const refreshEnterpriseState = useCallback(async () => {
    try {
      const me = await requestSenaWorkspaceJson<EnterpriseContext>(
        SENA_WORKSPACE_API_ROUTES.auth.me,
        undefined,
        { errorMessage: "Could not load enterprise session." }
      ).catch(() => null);
      if (!me?.user) {
        resetEnterpriseCsrfToken();
        clearEnterpriseSessionState();
        return;
      }
      const nextContext = me;
      setEnterpriseContext(nextContext);
      void refreshEnterpriseTeamState().catch(() => setEnterpriseTeamState(null));
      void refreshEnterpriseMfaState().catch(() => setEnterpriseMfaStatus(null));
      void refreshEnterpriseSessionList().catch(() => setEnterpriseSessionList(null));

      const projects = await getEnterpriseProjectsAction().catch(() => null);
      if (projects) setEnterpriseProjects(projects.projects ?? []);
      const teamId = nextContext.teams[0]?.id;
      if (teamId) {
        void refreshEnterprisePlatformDecisionState(teamId).catch(() => setEnterprisePlatformDecisionState(null));
        void refreshEnterpriseReleaseGateReviews(teamId).catch(() => setEnterpriseReleaseGateState(null));
        const imports = await getEnterpriseImportRunsAction({ teamId }).catch(() => null);
        if (imports) setEnterpriseImportRuns(imports.importRuns ?? []);
        const analysis = await getEnterpriseAnalysisRunsAction({ teamId }).catch(() => null);
        if (analysis) setEnterpriseAnalysisRuns(analysis.analysisRuns ?? []);
      }
    } catch {
      clearEnterpriseSessionState();
    }
  }, [
    clearEnterpriseSessionState,
    refreshEnterpriseMfaState,
    refreshEnterprisePlatformDecisionState,
    refreshEnterpriseReleaseGateReviews,
    refreshEnterpriseSessionList,
    refreshEnterpriseTeamState,
    resetEnterpriseCsrfToken,
    setEnterpriseAnalysisRuns,
    setEnterpriseContext,
    setEnterpriseImportRuns,
    setEnterpriseMfaStatus,
    setEnterprisePlatformDecisionState,
    setEnterpriseProjects,
    setEnterpriseReleaseGateState,
    setEnterpriseSessionList,
    setEnterpriseTeamState
  ]);

  return {
    logoutEnterpriseSessionFromWorkspace,
    refreshEnterpriseTeamState,
    refreshEnterpriseMfaState,
    refreshEnterpriseSessionList,
    refreshEnterprisePlatformDecisionState,
    refreshEnterpriseReleaseGateReviews,
    refreshEnterpriseState,
    revokeEnterpriseSession
  };
}
