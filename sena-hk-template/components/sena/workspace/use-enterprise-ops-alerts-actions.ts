"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { SENA_WORKSPACE_API_ROUTES } from "./api-client";
import { deliverEnterpriseOpsAlertsAction } from "./enterprise-ops-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseOpsAlertsActionsOptions = {
  enterpriseUserPresent: boolean;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterpriseOpsAlertsActions({
  enterpriseUserPresent,
  enterpriseJsonHeaders,
  exportEnterpriseJsonArtifact,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterpriseOpsAlertsActionsOptions) {
  const exportEnterpriseOpsAlertsJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts,
      "sena-enterprise-ops-alerts.json",
      "Enterprise ops alerts"
    );
  }, [exportEnterpriseJsonArtifact]);

  const deliverEnterpriseOpsAlertsFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before delivering enterprise ops alerts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseOpsAlertsAction({ jsonHeaders: enterpriseJsonHeaders });
      setEnterpriseMessage(`Ops alert delivery ${payload.status ?? "checked"}: ${payload.alerts?.summary?.firing ?? 0} firing, ${payload.alerts?.summary?.critical ?? 0} critical.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise ops alert delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    deliverEnterpriseOpsAlertsFromWorkspace,
    exportEnterpriseOpsAlertsJson
  };
}
