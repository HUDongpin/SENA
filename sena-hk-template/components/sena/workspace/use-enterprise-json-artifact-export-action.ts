"use client";

import { useCallback } from "react";
import { exportEnterpriseJsonArtifactAction } from "./enterprise-ops-actions";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type EnterpriseJsonArtifactExportActionOptions = {
  downloadText: DownloadText;
  enterpriseUserPresent: boolean;
  setEnterpriseBusy: (busy: boolean) => void;
  setEnterpriseMessage: (message: string) => void;
};

export function useEnterpriseJsonArtifactExportAction({
  downloadText,
  enterpriseUserPresent,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterpriseJsonArtifactExportActionOptions) {
  const exportEnterpriseJsonArtifact = useCallback(async (url: string, filename: string, label: string) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before exporting enterprise governance artifacts.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await exportEnterpriseJsonArtifactAction(url, label);
      downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
      setEnterpriseMessage(`${label} exported.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : `${label} export failed.`);
    } finally {
      setEnterpriseBusy(false);
    }
  }, [downloadText, enterpriseUserPresent, setEnterpriseBusy, setEnterpriseMessage]);

  return {
    exportEnterpriseJsonArtifact
  };
}
