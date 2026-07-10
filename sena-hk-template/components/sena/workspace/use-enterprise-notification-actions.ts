"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  deliverEnterpriseNotificationsAction,
  markEnterpriseNotificationReadAction
} from "./enterprise-actions";
import type { EnterpriseTeamState } from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseNotificationActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseTeamState: () => Promise<EnterpriseTeamState>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
};

export function useEnterpriseNotificationActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseJsonHeaders,
  refreshEnterpriseTeamState,
  setEnterpriseBusy,
  setEnterpriseMessage
}: EnterpriseNotificationActionsOptions) {
  const markEnterpriseNotificationReadFromWorkspace = useCallback(async (notificationId: string) => {
    if (!notificationId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await markEnterpriseNotificationReadAction({ notificationId }, { jsonHeaders: enterpriseJsonHeaders });
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Notification ${payload.notification?.id ?? notificationId} marked read.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Notification update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  const deliverEnterpriseNotifications = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before running notification delivery.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseNotificationsAction(
        { delivery: "notifications", teamId: activeEnterpriseTeamId || undefined },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Notification webhook delivery checked ${payload.notifications?.length ?? 0} item${payload.notifications?.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Notification delivery failed.");
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

  const deliverEnterpriseEmailsFromWorkspace = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before running email delivery.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await deliverEnterpriseNotificationsAction(
        { delivery: "email", teamId: activeEnterpriseTeamId || undefined },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Institution email delivery checked ${payload.deliveries?.length ?? payload.emailDeliveries?.length ?? 0} item${(payload.deliveries?.length ?? payload.emailDeliveries?.length) === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Email delivery failed.");
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
    deliverEnterpriseEmailsFromWorkspace,
    deliverEnterpriseNotifications,
    markEnterpriseNotificationReadFromWorkspace
  };
}
