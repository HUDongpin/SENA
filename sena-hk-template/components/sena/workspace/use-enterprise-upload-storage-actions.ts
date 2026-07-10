"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback } from "react";
import {
  createEnterpriseUploadRegistryFilesAction,
  deliverEnterpriseUploadObjectStorageAction,
  refreshEnterpriseUploadStorageAction
} from "./enterprise-actions";
import type {
  EnterpriseUploadStorageState,
  EnterpriseUploadStorageVerification
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseUploadStorageRefreshOptions = { verify?: boolean };

export type EnterpriseUploadStorageActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  enterpriseCsrfHeaders: () => Promise<Record<string, string>>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseUploadStorage: StateSetter<EnterpriseUploadStorageState | null>;
};

export function useEnterpriseUploadStorageActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseJsonHeaders,
  enterpriseCsrfHeaders,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseUploadStorage
}: EnterpriseUploadStorageActionsOptions) {
  const refreshEnterpriseUploadStorage = useCallback(async (
    options: EnterpriseUploadStorageRefreshOptions = { verify: true }
  ) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before loading enterprise upload storage.");
      return null;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await refreshEnterpriseUploadStorageAction({
        teamId: activeEnterpriseTeamId || undefined,
        verify: options.verify
      });
      setEnterpriseUploadStorage(payload);
      const verification = payload.storageVerification as EnterpriseUploadStorageVerification | undefined;
      setEnterpriseMessage(verification
        ? `Upload storage ${verification.status}: ${verification.summary.verifiedBlobs}/${verification.summary.registeredUploads} blobs verified.`
        : `Upload registry loaded ${payload.uploads?.length ?? 0} upload${payload.uploads?.length === 1 ? "" : "s"}.`);
      return payload;
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Upload storage refresh failed.");
      return null;
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseUploadStorage
  ]);

  const createEnterpriseUploadRegistryFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with an active team before creating enterprise uploads.");
      return;
    }
    if (files.length === 0) return;
    setEnterpriseBusy(true);
    try {
      const payload = await createEnterpriseUploadRegistryFilesAction(
        { files, teamId: activeEnterpriseTeamId },
        { csrfHeaders: enterpriseCsrfHeaders }
      );
      setEnterpriseUploadStorage(payload);
      await refreshEnterpriseUploadStorage({ verify: true });
      setEnterpriseMessage(`Enterprise upload registry created ${payload.uploads?.length ?? files.length} file${files.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Enterprise upload failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseCsrfHeaders,
    enterpriseUserPresent,
    refreshEnterpriseUploadStorage,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseUploadStorage
  ]);

  const deliverEnterpriseUploadObjectStorage = useCallback(async (uploadId?: string) => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before delivering enterprise uploads to object storage.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseUploadObjectStorageAction(
        {
          teamId: activeEnterpriseTeamId || undefined,
          uploadId
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseUploadStorage({ verify: true });
      setEnterpriseMessage(`Object-storage delivery ${payload.status ?? "checked"}: ${payload.summary?.delivered ?? 0} delivered, ${payload.summary?.failed ?? 0} failed, ${payload.summary?.skipped ?? 0} skipped.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Object-storage delivery failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseUploadStorage,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    createEnterpriseUploadRegistryFiles,
    deliverEnterpriseUploadObjectStorage,
    refreshEnterpriseUploadStorage
  };
}
