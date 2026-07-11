"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { SenaProjectSnapshot } from "@/lib/sena/types";
import { SenaWorkspaceApiError } from "./api-client";
import {
  openEnterpriseProjectAction,
  restoreEnterpriseProjectRevisionAction,
  runEnterpriseAnalysisAction,
  saveEnterpriseProjectAction
} from "./enterprise-actions";
import type {
  EnterpriseAnalysisRun,
  EnterpriseCollaborationState,
  EnterpriseProjectSummary
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseProjectActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  activeEnterpriseTeamName: string;
  activeEnterpriseProjectId: string;
  reportTitle: string;
  modelSummary: { people: number; concepts: number };
  enterpriseProjects: EnterpriseProjectSummary[];
  enterpriseCollaboration: EnterpriseCollaborationState | null;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  buildCurrentProjectSnapshot: () => SenaProjectSnapshot;
  restoreProjectSnapshot: (snapshot: SenaProjectSnapshot, fileName: string) => void;
  refreshEnterpriseState: () => Promise<void>;
  refreshEnterpriseCollaboration: (projectId?: string) => Promise<void>;
  touchEnterprisePresence: (projectId?: string, options?: { quiet?: boolean }) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setActiveEnterpriseProjectId: StateSetter<string>;
  setEnterpriseAnalysisRuns: StateSetter<EnterpriseAnalysisRun[]>;
};

export function useEnterpriseProjectActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  activeEnterpriseTeamName,
  activeEnterpriseProjectId,
  reportTitle,
  modelSummary,
  enterpriseProjects,
  enterpriseCollaboration,
  enterpriseJsonHeaders,
  buildCurrentProjectSnapshot,
  restoreProjectSnapshot,
  refreshEnterpriseState,
  refreshEnterpriseCollaboration,
  touchEnterprisePresence,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setActiveEnterpriseProjectId,
  setEnterpriseAnalysisRuns
}: EnterpriseProjectActionsOptions) {
  const saveEnterpriseProject = useCallback(async () => {
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in before saving server-side SENA projects.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const snapshot = buildCurrentProjectSnapshot();
      const activeProjectSummary = enterpriseProjects.find((project) => project.id === activeEnterpriseProjectId);
      const expectedVersion = activeEnterpriseProjectId
        ? enterpriseCollaboration?.project.id === activeEnterpriseProjectId
          ? enterpriseCollaboration.project.currentVersion
          : activeProjectSummary?.currentVersion
        : undefined;
      const payload = await saveEnterpriseProjectAction(
        {
          teamId: activeEnterpriseTeamId,
          title: reportTitle,
          description: `Saved from /workspace/sena with ${modelSummary.people} people and ${modelSummary.concepts} codes.`,
          projectId: activeEnterpriseProjectId || undefined,
          expectedVersion,
          snapshot
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setActiveEnterpriseProjectId(payload.project.id);
      setEnterpriseMessage(`${payload.project.title} saved to ${activeEnterpriseTeamName || "SENA team"} at version ${payload.project.currentVersion}.`);
      await refreshEnterpriseState();
      await refreshEnterpriseCollaboration(payload.project.id);
      await touchEnterprisePresence(payload.project.id);
    } catch (error) {
      if (error instanceof SenaWorkspaceApiError && error.status === 409 && activeEnterpriseProjectId) {
        await refreshEnterpriseState();
        await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
        setEnterpriseMessage(`${error.message || "Project version conflict."} Refresh the server project before saving again.`);
      } else {
        setEnterpriseMessage(error instanceof Error ? error.message : "Project save failed.");
      }
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    activeEnterpriseTeamId,
    activeEnterpriseTeamName,
    buildCurrentProjectSnapshot,
    enterpriseCollaboration,
    enterpriseJsonHeaders,
    enterpriseProjects,
    enterpriseUserPresent,
    modelSummary.concepts,
    modelSummary.people,
    refreshEnterpriseCollaboration,
    refreshEnterpriseState,
    reportTitle,
    setActiveEnterpriseProjectId,
    setEnterpriseBusy,
    setEnterpriseMessage,
    touchEnterprisePresence
  ]);

  const runEnterpriseAnalysis = useCallback(async () => {
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in before running server-side SENA analysis.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await runEnterpriseAnalysisAction(
        {
          teamId: activeEnterpriseTeamId,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: activeEnterpriseProjectId ? undefined : buildCurrentProjectSnapshot(),
          title: reportTitle,
          includeRuntimeBundle: true,
          persist: false
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      const enterpriseAnalysisRun = payload.enterpriseAnalysisRun;
      if (enterpriseAnalysisRun) {
        setEnterpriseAnalysisRuns((runs) => [
          enterpriseAnalysisRun,
          ...runs.filter((run) => run.id !== enterpriseAnalysisRun.id)
        ]);
      }
      setEnterpriseMessage(`Server analysis ${payload.enterpriseAnalysisRun?.id ?? "run"} recorded: ${payload.summary.people} people, ${payload.summary.concepts} codes, ${payload.summary.claimUse}.`);
      await refreshEnterpriseState();
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Server-side SENA analysis failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    activeEnterpriseTeamId,
    buildCurrentProjectSnapshot,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseState,
    reportTitle,
    setEnterpriseAnalysisRuns,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  const openEnterpriseProject = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await openEnterpriseProjectAction({ projectId });
      restoreProjectSnapshot(payload.project.snapshot, payload.project.title);
      setActiveEnterpriseProjectId(projectId);
      setEnterpriseMessage(`${payload.project.title} opened from server project storage.`);
      await refreshEnterpriseCollaboration(projectId);
      await touchEnterprisePresence(projectId);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Could not open project.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    refreshEnterpriseCollaboration,
    restoreProjectSnapshot,
    setActiveEnterpriseProjectId,
    setEnterpriseBusy,
    setEnterpriseMessage,
    touchEnterprisePresence
  ]);

  const restoreEnterpriseProjectRevision = useCallback(async (revisionId: string) => {
    if (!activeEnterpriseProjectId || !enterpriseCollaboration) return;
    setEnterpriseBusy(true);
    try {
      const payload = await restoreEnterpriseProjectRevisionAction(
        {
          projectId: activeEnterpriseProjectId,
          revisionId,
          expectedVersion: enterpriseCollaboration.project.currentVersion
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      restoreProjectSnapshot(payload.project.snapshot, `${payload.project.title} v${payload.restoredFrom.version}`);
      setActiveEnterpriseProjectId(payload.project.id);
      setEnterpriseMessage(`${payload.project.title} restored from version ${payload.restoredFrom.version} into version ${payload.project.currentVersion}.`);
      await refreshEnterpriseState();
      await refreshEnterpriseCollaboration(payload.project.id);
      await touchEnterprisePresence(payload.project.id);
    } catch (error) {
      if (error instanceof SenaWorkspaceApiError && error.status === 409) {
        await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
        setEnterpriseMessage(`${error.message || "Project revision restore conflict."} Refresh the project history before restoring again.`);
      } else {
        setEnterpriseMessage(error instanceof Error ? error.message : "Project revision restore failed.");
      }
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseCollaboration,
    enterpriseJsonHeaders,
    refreshEnterpriseCollaboration,
    refreshEnterpriseState,
    restoreProjectSnapshot,
    setActiveEnterpriseProjectId,
    setEnterpriseBusy,
    setEnterpriseMessage,
    touchEnterprisePresence
  ]);

  return {
    openEnterpriseProject,
    restoreEnterpriseProjectRevision,
    runEnterpriseAnalysis,
    saveEnterpriseProject
  };
}
