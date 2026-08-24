"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  exportEnterprisePublicationAction,
  type EnterprisePublicationFormat
} from "./enterprise-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterprisePublicationActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseProjectId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterprisePublicationActions({
  enterpriseUserPresent,
  activeEnterpriseProjectId,
  enterpriseJsonHeaders,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterprisePublicationActionsOptions) {
  const exportPublication = useCallback(async (format: EnterprisePublicationFormat) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before using enterprise publication exports.");
      return;
    }
    if (!activeEnterpriseProjectId) {
      setEnterpriseMessage("Save or open a server-side project before using enterprise publication exports.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await exportEnterprisePublicationAction(
        {
          format,
          projectId: activeEnterpriseProjectId
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      const url = URL.createObjectURL(payload.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setEnterpriseMessage(`${payload.filename} exported from the enterprise publication API using the server project.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Publication export failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    exportPublication
  };
}
