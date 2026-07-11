"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { syncEnterpriseDatabaseAction } from "./enterprise-ops-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseDatabaseSyncActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseTeamState: () => Promise<unknown>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterpriseDatabaseSyncActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseJsonHeaders,
  refreshEnterpriseTeamState,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterpriseDatabaseSyncActionsOptions) {
  const syncEnterpriseDatabaseFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before running enterprise database sync.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await syncEnterpriseDatabaseAction(
        { teamId: activeEnterpriseTeamId || undefined },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Database sync ${payload.status ?? "checked"}: ${payload.backup?.recordCounts?.teams ?? 0} teams, ${payload.backup?.recordCounts?.projects ?? 0} projects.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise database sync failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    syncEnterpriseDatabaseFromWorkspace
  };
}
