"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  addEnterpriseAdjudicationAction,
  addEnterpriseCommentAction,
  deliverEnterpriseCollaborationPubSubAction,
  refreshEnterpriseClaimPackageAction,
  refreshEnterpriseCollaborationAction,
  runEnterpriseSsoPreflightAction,
  touchEnterprisePresenceAction
} from "./enterprise-actions";
import type {
  EnterpriseClaimEvidencePackage,
  EnterpriseCollaborationState,
  EnterpriseSsoPreflight,
  EnterpriseSsoProvider
} from "./enterprise-contracts";
import type { SenaPlotView } from "./plot-tools-panel";
import type { WorkspaceRailMode } from "./workspace-shell-panels";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseCollaborationSelectedTarget = {
  id?: string;
  label?: string;
  kind?: string;
  layer?: string;
} | undefined;

export type EnterpriseCollaborationActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseProjectId: string;
  workspaceRailMode: WorkspaceRailMode;
  activePlotView: SenaPlotView;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  enterpriseComment: string;
  adjudicationItemId: string;
  adjudicationCodeId: string;
  adjudicationDecision: "include" | "exclude" | "revise";
  adjudicationNotesQuick: string;
  latestEnterpriseReliabilityRunId?: string;
  selected: EnterpriseCollaborationSelectedTarget;
  setEnterpriseCollaboration: StateSetter<EnterpriseCollaborationState | null>;
  setEnterpriseClaimPackage: StateSetter<EnterpriseClaimEvidencePackage | null>;
  setEnterpriseSsoPreflight: StateSetter<EnterpriseSsoPreflight | null>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseComment: StateSetter<string>;
  setAdjudicationItemId: StateSetter<string>;
  setAdjudicationCodeId: StateSetter<string>;
  setAdjudicationNotesQuick: StateSetter<string>;
};

function selectedTargetKind(selected: EnterpriseCollaborationSelectedTarget) {
  if (selected && "layer" in selected) return "edge";
  if (selected?.kind === "person" || selected?.kind === "concept") return "node";
  return "project";
}

export function useEnterpriseCollaborationActions({
  enterpriseUserPresent,
  activeEnterpriseProjectId,
  workspaceRailMode,
  activePlotView,
  enterpriseJsonHeaders,
  enterpriseComment,
  adjudicationItemId,
  adjudicationCodeId,
  adjudicationDecision,
  adjudicationNotesQuick,
  latestEnterpriseReliabilityRunId,
  selected,
  setEnterpriseCollaboration,
  setEnterpriseClaimPackage,
  setEnterpriseSsoPreflight,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseComment,
  setAdjudicationItemId,
  setAdjudicationCodeId,
  setAdjudicationNotesQuick
}: EnterpriseCollaborationActionsOptions) {
  const refreshEnterpriseCollaboration = useCallback(async (projectId = activeEnterpriseProjectId) => {
    if (!projectId) {
      setEnterpriseCollaboration(null);
      setEnterpriseClaimPackage(null);
      return;
    }
    try {
      const payload = await refreshEnterpriseCollaborationAction({ projectId });
      setEnterpriseCollaboration(payload);
      const claimPayload = await refreshEnterpriseClaimPackageAction({ projectId }).catch(() => null);
      setEnterpriseClaimPackage(claimPayload);
    } catch (error) {
      setEnterpriseClaimPackage(null);
      setEnterpriseMessage(error instanceof Error ? error.message : "Could not load collaboration state.");
    }
  }, [activeEnterpriseProjectId, setEnterpriseClaimPackage, setEnterpriseCollaboration, setEnterpriseMessage]);

  const runEnterpriseSsoPreflightFromWorkspace = useCallback(async (provider?: EnterpriseSsoProvider) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before running enterprise SSO preflight.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const preflight = await runEnterpriseSsoPreflightAction(provider);
      setEnterpriseSsoPreflight(preflight);
      setEnterpriseMessage(`SSO preflight checked ${preflight.summary.checked} provider${preflight.summary.checked === 1 ? "" : "s"}: ${preflight.summary.passed} passed, ${preflight.summary.review} for review.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise SSO preflight failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseSsoPreflight
  ]);

  const touchEnterprisePresence = useCallback(async (projectId = activeEnterpriseProjectId, options: { quiet?: boolean } = {}) => {
    if (!projectId) return;
    try {
      await touchEnterprisePresenceAction(
        {
          projectId,
          activeView: workspaceRailMode,
          cursorLabel: activePlotView
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      if (!options.quiet) {
        await refreshEnterpriseCollaboration(projectId);
        setEnterpriseMessage("Presence synced for the active SENA project.");
      }
    } catch (error) {
      if (!options.quiet) setEnterpriseMessage(error instanceof Error ? error.message : "Presence update failed.");
    }
  }, [activeEnterpriseProjectId, activePlotView, enterpriseJsonHeaders, refreshEnterpriseCollaboration, setEnterpriseMessage, workspaceRailMode]);

  const addEnterpriseComment = useCallback(async () => {
    if (!activeEnterpriseProjectId || !enterpriseComment.trim()) return;
    try {
      await addEnterpriseCommentAction(
        {
          projectId: activeEnterpriseProjectId,
          body: enterpriseComment,
          target: {
            kind: selectedTargetKind(selected),
            id: selected?.id,
            label: selected?.label
          }
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setEnterpriseComment("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage("Project comment added.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Comment failed.");
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseComment,
    enterpriseJsonHeaders,
    refreshEnterpriseCollaboration,
    selected,
    setEnterpriseComment,
    setEnterpriseMessage
  ]);

  const addEnterpriseAdjudication = useCallback(async () => {
    if (!activeEnterpriseProjectId || !adjudicationItemId.trim() || !adjudicationCodeId.trim()) return;
    try {
      await addEnterpriseAdjudicationAction(
        {
          projectId: activeEnterpriseProjectId,
          reliabilityRunId: latestEnterpriseReliabilityRunId,
          itemId: adjudicationItemId,
          codeId: adjudicationCodeId,
          decision: adjudicationDecision,
          notes: adjudicationNotesQuick
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setAdjudicationItemId("");
      setAdjudicationCodeId("");
      setAdjudicationNotesQuick("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage("Adjudication record added to the project history.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Adjudication failed.");
    }
  }, [
    activeEnterpriseProjectId,
    adjudicationCodeId,
    adjudicationDecision,
    adjudicationItemId,
    adjudicationNotesQuick,
    enterpriseJsonHeaders,
    latestEnterpriseReliabilityRunId,
    refreshEnterpriseCollaboration,
    setAdjudicationCodeId,
    setAdjudicationItemId,
    setAdjudicationNotesQuick,
    setEnterpriseMessage
  ]);

  const deliverEnterpriseCollaborationPubSubFromWorkspace = useCallback(async (projectId = activeEnterpriseProjectId) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before delivering collaboration pub/sub events.");
      return;
    }
    if (!projectId) {
      setEnterpriseMessage("Save or select a server project before delivering collaboration pub/sub events.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseCollaborationPubSubAction(
        { projectId },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseCollaboration(projectId);
      setEnterpriseMessage(`Collaboration pub/sub delivery checked: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Collaboration pub/sub delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    refreshEnterpriseCollaboration,
    touchEnterprisePresence,
    addEnterpriseComment,
    addEnterpriseAdjudication,
    deliverEnterpriseCollaborationPubSubFromWorkspace,
    runEnterpriseSsoPreflightFromWorkspace
  };
}
