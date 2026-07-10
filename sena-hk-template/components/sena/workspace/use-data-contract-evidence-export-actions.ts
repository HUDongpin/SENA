"use client";

import { useCallback } from "react";
import type { SenaEnterpriseImportCleaningManifest } from "@/lib/sena/import-adapters";
import type {
  EnterpriseCollaborationState,
  EnterpriseImportRun
} from "./enterprise-contracts";
import type { SenaDataContractAudit } from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;
type EnterpriseValidationRun = EnterpriseCollaborationState["validationRuns"][number];
type ImportCleaningManifest =
  | NonNullable<EnterpriseImportRun["cleaningManifest"]>
  | SenaEnterpriseImportCleaningManifest;

export type DataContractEvidenceExportActionsOptions = {
  downloadText: DownloadText;
  latestEnterpriseValidationRun: EnterpriseValidationRun | null;
  latestImportCleaningManifest: ImportCleaningManifest | null;
  setEnterpriseMessage: (message: string) => void;
  sourceDataContractAudit: SenaDataContractAudit;
};

export function useDataContractEvidenceExportActions({
  downloadText,
  latestEnterpriseValidationRun,
  latestImportCleaningManifest,
  setEnterpriseMessage,
  sourceDataContractAudit
}: DataContractEvidenceExportActionsOptions) {
  const exportDataContractAuditJson = useCallback(() => {
    downloadText(
      "sena-data-contract-audit.json",
      JSON.stringify(sourceDataContractAudit, null, 2),
      "application/json"
    );
  }, [downloadText, sourceDataContractAudit]);

  const exportEnterpriseCleaningManifestJson = useCallback(() => {
    if (!latestImportCleaningManifest) {
      setEnterpriseMessage("Run an enterprise or local adapter import with a cleaning manifest before exporting.");
      return;
    }
    downloadText(
      "sena-import-cleaning-manifest.json",
      JSON.stringify(latestImportCleaningManifest, null, 2),
      "application/json"
    );
  }, [downloadText, latestImportCleaningManifest, setEnterpriseMessage]);

  const exportEnterpriseValidationParityEvidenceJson = useCallback(() => {
    if (!latestEnterpriseValidationRun?.parityEvidence) {
      setEnterpriseMessage("Run a group-comparison validation with parity evidence before exporting.");
      return;
    }
    downloadText(
      "sena-validation-parity-evidence.json",
      JSON.stringify(latestEnterpriseValidationRun.parityEvidence, null, 2),
      "application/json"
    );
    setEnterpriseMessage("Validation parity evidence exported.");
  }, [downloadText, latestEnterpriseValidationRun, setEnterpriseMessage]);

  return {
    exportDataContractAuditJson,
    exportEnterpriseCleaningManifestJson,
    exportEnterpriseValidationParityEvidenceJson
  };
}
