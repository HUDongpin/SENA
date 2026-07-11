"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  disableEnterpriseMfaAction,
  enableEnterpriseMfaAction,
  startEnterpriseMfaSetupAction
} from "./enterprise-actions";
import type {
  EnterpriseMfaSetup,
  EnterpriseMfaStatus
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseMfaActionsOptions = {
  enterpriseUserPresent: boolean;
  enterpriseMfaSetup: EnterpriseMfaSetup | null;
  enterpriseMfaEnableCode: string;
  enterpriseMfaDisableCode: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseMfaStatus: StateSetter<EnterpriseMfaStatus | null>;
  setEnterpriseMfaSetup: StateSetter<EnterpriseMfaSetup | null>;
  setEnterpriseMfaEnableCode: StateSetter<string>;
  setEnterpriseMfaDisableCode: StateSetter<string>;
};

export function useEnterpriseMfaActions({
  enterpriseUserPresent,
  enterpriseMfaSetup,
  enterpriseMfaEnableCode,
  enterpriseMfaDisableCode,
  enterpriseJsonHeaders,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseMfaStatus,
  setEnterpriseMfaSetup,
  setEnterpriseMfaEnableCode,
  setEnterpriseMfaDisableCode
}: EnterpriseMfaActionsOptions) {
  const startEnterpriseMfaSetup = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before setting up authenticator MFA.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await startEnterpriseMfaSetupAction({ jsonHeaders: enterpriseJsonHeaders });
      setEnterpriseMfaSetup(payload);
      setEnterpriseMfaEnableCode("");
      setEnterpriseMessage(`Authenticator setup started. Enter the 6-digit code before ${new Date(payload.expiresAt).toLocaleTimeString()}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA setup failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseMfaEnableCode,
    setEnterpriseMfaSetup
  ]);

  const enableEnterpriseMfaFromSetup = useCallback(async () => {
    const code = enterpriseMfaEnableCode.trim();
    if (!enterpriseMfaSetup || !code) {
      setEnterpriseMessage("Start MFA setup and enter the authenticator code before enabling.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await enableEnterpriseMfaAction(
        {
          setupToken: enterpriseMfaSetup.setupToken,
          code
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setEnterpriseMfaStatus(payload);
      setEnterpriseMfaSetup(null);
      setEnterpriseMfaEnableCode("");
      setEnterpriseMessage("Authenticator MFA enabled for this SENA account.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA enable failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    enterpriseMfaEnableCode,
    enterpriseMfaSetup,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseMfaEnableCode,
    setEnterpriseMfaSetup,
    setEnterpriseMfaStatus
  ]);

  const disableEnterpriseMfaFromCode = useCallback(async () => {
    const code = enterpriseMfaDisableCode.trim();
    if (!code) {
      setEnterpriseMessage("Enter your current authenticator code before disabling MFA.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await disableEnterpriseMfaAction({ code }, { jsonHeaders: enterpriseJsonHeaders });
      setEnterpriseMfaStatus(payload);
      setEnterpriseMfaSetup(null);
      setEnterpriseMfaDisableCode("");
      setEnterpriseMessage("Authenticator MFA disabled for this SENA account.");
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "MFA disable failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    enterpriseMfaDisableCode,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setEnterpriseMfaDisableCode,
    setEnterpriseMfaSetup,
    setEnterpriseMfaStatus
  ]);

  return {
    disableEnterpriseMfaFromCode,
    enableEnterpriseMfaFromSetup,
    startEnterpriseMfaSetup
  };
}
