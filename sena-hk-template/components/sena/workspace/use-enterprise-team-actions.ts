"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  acceptTeamInvitationAction,
  createTeamInvitationAction,
  revokeTeamInvitationAction,
  updateTeamMembershipAction
} from "./enterprise-actions";
import type {
  EnterpriseContext,
  EnterpriseRole,
  EnterpriseTeamState
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseTeamActionsOptions = {
  activeEnterpriseTeamId: string;
  teamInviteEmail: string;
  teamInviteRole: EnterpriseRole;
  teamInviteCode: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseTeamState: () => Promise<EnterpriseTeamState>;
  refreshEnterpriseState: () => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setEnterpriseContext: StateSetter<EnterpriseContext | null>;
  setTeamInviteEmail: StateSetter<string>;
  setTeamInviteCode: StateSetter<string>;
};

export function useEnterpriseTeamActions({
  activeEnterpriseTeamId,
  teamInviteEmail,
  teamInviteRole,
  teamInviteCode,
  enterpriseJsonHeaders,
  refreshEnterpriseTeamState,
  refreshEnterpriseState,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setEnterpriseContext,
  setTeamInviteEmail,
  setTeamInviteCode
}: EnterpriseTeamActionsOptions) {
  const createTeamInvitation = useCallback(async () => {
    const email = teamInviteEmail.trim();
    if (!activeEnterpriseTeamId || !email) {
      setEnterpriseMessage("Choose a team and enter an email before creating an invitation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await createTeamInvitationAction(
        {
          teamId: activeEnterpriseTeamId,
          email,
          role: teamInviteRole
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setTeamInviteEmail("");
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Invitation queued for ${payload.invitation?.email ?? email} as ${payload.invitation?.role ?? teamInviteRole}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setTeamInviteEmail,
    teamInviteEmail,
    teamInviteRole
  ]);

  const acceptTeamInvitation = useCallback(async () => {
    const inviteCode = teamInviteCode.trim();
    if (!inviteCode) {
      setEnterpriseMessage("Paste an invitation code before accepting an invitation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await acceptTeamInvitationAction({ inviteCode }, { jsonHeaders: enterpriseJsonHeaders });
      setTeamInviteCode("");
      if (payload.context) setEnterpriseContext(payload.context as EnterpriseContext);
      await refreshEnterpriseState();
      setEnterpriseMessage(`Invitation accepted for ${payload.context?.teams?.[0]?.name ?? "SENA team"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation acceptance failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    refreshEnterpriseState,
    setEnterpriseBusy,
    setEnterpriseContext,
    setEnterpriseMessage,
    setTeamInviteCode,
    teamInviteCode
  ]);

  const revokeTeamInvitation = useCallback(async (invitationId: string) => {
    if (!invitationId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await revokeTeamInvitationAction({ invitationId }, { jsonHeaders: enterpriseJsonHeaders });
      await refreshEnterpriseTeamState();
      setEnterpriseMessage(`Invitation revoked for ${payload.invitation?.email ?? invitationId}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Invitation revoke failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  const updateTeamMembership = useCallback(async (
    membershipId: string,
    input: { role?: EnterpriseRole; status?: "active" | "suspended" }
  ) => {
    if (!membershipId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await updateTeamMembershipAction({ membershipId, ...input }, { jsonHeaders: enterpriseJsonHeaders });
      await refreshEnterpriseTeamState();
      await refreshEnterpriseState();
      setEnterpriseMessage(`Membership ${payload.membership?.id ?? membershipId} updated: ${payload.membership?.role ?? input.role ?? "role"} · ${payload.membership?.status ?? input.status ?? "status"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Membership update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    enterpriseJsonHeaders,
    refreshEnterpriseState,
    refreshEnterpriseTeamState,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    acceptTeamInvitation,
    createTeamInvitation,
    revokeTeamInvitation,
    updateTeamMembership
  };
}
