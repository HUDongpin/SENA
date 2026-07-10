"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { SenaProjectSnapshot } from "@/lib/sena/types";
import {
  exportEnterprisePublicationAction,
  type EnterprisePublicationFormat
} from "./enterprise-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterprisePublicationActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  activeEnterpriseProjectId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  buildCurrentProjectSnapshot: () => SenaProjectSnapshot;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterprisePublicationActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  activeEnterpriseProjectId,
  enterpriseJsonHeaders,
  buildCurrentProjectSnapshot,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterprisePublicationActionsOptions) {
  const exportPublication = useCallback(async (format: EnterprisePublicationFormat) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before using enterprise publication exports.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await exportEnterprisePublicationAction(
        {
          teamId: activeEnterpriseTeamId,
          format,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: activeEnterpriseProjectId ? undefined : buildCurrentProjectSnapshot()
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      const url = URL.createObjectURL(payload.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      const exportSource = activeEnterpriseProjectId ? "server project" : "workspace snapshot";
      setEnterpriseMessage(`${payload.filename} exported from the enterprise publication API using ${exportSource}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Publication export failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    activeEnterpriseTeamId,
    buildCurrentProjectSnapshot,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    exportPublication
  };
}
