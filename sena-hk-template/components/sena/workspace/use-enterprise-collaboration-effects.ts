"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";
import {
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import {
  touchEnterprisePresenceAction
} from "./enterprise-actions";
import type { EnterpriseCollaborationState } from "./enterprise-contracts";
import type { SenaPlotView } from "./plot-tools-panel";
import type { WorkspaceRailMode } from "./workspace-shell-panels";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseCollaborationTransport = "manual" | "streaming" | "reconnecting";

export type EnterpriseCollaborationEffectsOptions = {
  activeEnterpriseProjectId: string;
  enterpriseUserId: string | null | undefined;
  workspaceRailMode: WorkspaceRailMode;
  activePlotView: SenaPlotView;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  setEnterpriseCollaboration: StateSetter<EnterpriseCollaborationState | null>;
  setEnterpriseCollaborationTransport: StateSetter<EnterpriseCollaborationTransport>;
};

export function useEnterpriseCollaborationEffects({
  activeEnterpriseProjectId,
  enterpriseUserId,
  workspaceRailMode,
  activePlotView,
  enterpriseJsonHeaders,
  setEnterpriseCollaboration,
  setEnterpriseCollaborationTransport
}: EnterpriseCollaborationEffectsOptions) {
  useEffect(() => {
    if (!activeEnterpriseProjectId || !enterpriseUserId) {
      setEnterpriseCollaborationTransport("manual");
      return undefined;
    }

    let closed = false;
    const source = new EventSource(SENA_WORKSPACE_API_ROUTES.enterprise.collaborationStream(activeEnterpriseProjectId));
    source.addEventListener("collaboration", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { collaboration?: EnterpriseCollaborationState };
        if (payload.collaboration) {
          setEnterpriseCollaboration(payload.collaboration);
          setEnterpriseCollaborationTransport("streaming");
        }
      } catch {
        setEnterpriseCollaborationTransport("reconnecting");
      }
    });
    source.onerror = () => {
      if (!closed) setEnterpriseCollaborationTransport("reconnecting");
    };

    return () => {
      closed = true;
      source.close();
      setEnterpriseCollaborationTransport("manual");
    };
  }, [
    activeEnterpriseProjectId,
    enterpriseUserId,
    setEnterpriseCollaboration,
    setEnterpriseCollaborationTransport
  ]);

  useEffect(() => {
    if (!activeEnterpriseProjectId || !enterpriseUserId) return undefined;
    const syncPresence = async () => {
      try {
        await touchEnterprisePresenceAction(
          {
            projectId: activeEnterpriseProjectId,
            activeView: workspaceRailMode,
            cursorLabel: activePlotView
          },
          { jsonHeaders: enterpriseJsonHeaders }
        );
      } catch {
        setEnterpriseCollaborationTransport("reconnecting");
      }
    };
    void syncPresence();
    const interval = window.setInterval(() => {
      void syncPresence();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [
    activeEnterpriseProjectId,
    activePlotView,
    enterpriseJsonHeaders,
    enterpriseUserId,
    setEnterpriseCollaborationTransport,
    workspaceRailMode
  ]);
}
