"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import {
  deliverEnterpriseAuditLogAction,
  deliverEnterpriseBackupAction,
  exportEnterpriseAuditCsvAction
} from "./enterprise-ops-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseAuditBackupActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  refreshEnterpriseTeamState: () => Promise<unknown>;
  downloadText: (filename: string, text: string, mimeType: string) => void;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterpriseAuditBackupActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseJsonHeaders,
  exportEnterpriseJsonArtifact,
  refreshEnterpriseTeamState,
  downloadText,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterpriseAuditBackupActionsOptions) {
  const exportEnterpriseBackupJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.backup, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-backup.json",
      "Enterprise backup"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseAuditCsv = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before exporting enterprise governance artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const text = await exportEnterpriseAuditCsvAction({
        teamId: activeEnterpriseTeamId || undefined
      });
      downloadText("sena-enterprise-audit-log.csv", text, "text/csv");
      setEnterpriseMessage("Enterprise audit CSV exported.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise audit CSV export failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    downloadText,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  const deliverEnterpriseAuditLogFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before delivering enterprise audit events.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseAuditLogAction(
        { teamId: activeEnterpriseTeamId || undefined },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Audit delivery checked: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise audit delivery failed.");
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

  const deliverEnterpriseBackupFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before delivering enterprise backup artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseBackupAction(
        { teamId: activeEnterpriseTeamId || undefined },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Backup delivery ${payload.status ?? "checked"}: ${payload.backup?.recordCounts?.projects ?? 0} projects, ${payload.backup?.recordCounts?.auditEvents ?? 0} audit events.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise backup delivery failed.");
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
    deliverEnterpriseAuditLogFromWorkspace,
    deliverEnterpriseBackupFromWorkspace,
    exportEnterpriseAuditCsv,
    exportEnterpriseBackupJson
  };
}
