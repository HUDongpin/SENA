import {
  CheckCircle2,
  RotateCcw,
  UsersRound,
  X
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type {
  EnterpriseRole,
  EnterpriseTeamState
} from "./enterprise-contracts";

const enterpriseRoleOptions: EnterpriseRole[] = ["pi", "admin", "coder", "reviewer", "viewer"];

type EnterpriseTeamMembership = EnterpriseTeamState["memberships"][number];
type EnterpriseTeamInvitation = EnterpriseTeamState["invitations"][number];
type EnterpriseTeamHandler = () => unknown | Promise<unknown>;

export type EnterpriseTeamOperationsPanelProps = {
  disabled: boolean;
  busy: boolean;
  enterpriseUserId: string;
  enterpriseTeamState: EnterpriseTeamState | null;
  enterpriseTeamMemberships: EnterpriseTeamMembership[];
  pendingEnterpriseInvitations: EnterpriseTeamInvitation[];
  teamInviteEmail: string;
  teamInviteRole: EnterpriseRole;
  teamInviteCode: string;
  onTeamInviteEmailChange: (value: string) => void;
  onTeamInviteRoleChange: (value: EnterpriseRole) => void;
  onTeamInviteCodeChange: (value: string) => void;
  onRefreshTeamState: EnterpriseTeamHandler;
  onCreateTeamInvitation: EnterpriseTeamHandler;
  onAcceptTeamInvitation: EnterpriseTeamHandler;
  onUpdateTeamMembership: (membershipId: string, input: { role?: EnterpriseRole; status?: "active" | "suspended" }) => unknown | Promise<unknown>;
  onRevokeTeamInvitation: (invitationId: string) => unknown | Promise<unknown>;
};

export function EnterpriseTeamOperationsPanel({
  disabled,
  busy,
  enterpriseUserId,
  enterpriseTeamState,
  enterpriseTeamMemberships,
  pendingEnterpriseInvitations,
  teamInviteEmail,
  teamInviteRole,
  teamInviteCode,
  onTeamInviteEmailChange,
  onTeamInviteRoleChange,
  onTeamInviteCodeChange,
  onRefreshTeamState,
  onCreateTeamInvitation,
  onAcceptTeamInvitation,
  onUpdateTeamMembership,
  onRevokeTeamInvitation
}: EnterpriseTeamOperationsPanelProps) {
  const enterpriseTeamUsersById = new Map((enterpriseTeamState?.users ?? []).map((user) => [user.id, user]));

  return (
    <div data-testid="enterprise-team-operations" data-visual-role="enterprise-rbac-team-operations" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Team operations</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            {enterpriseTeamState
              ? `${enterpriseTeamMemberships.length} members · ${pendingEnterpriseInvitations.length} pending invites · ${enterpriseTeamState.auditLog.length} audit events`
              : "Sign in to load team memberships, invitations, and audit events."}
          </div>
        </div>
        <button type="button" onClick={() => void onRefreshTeamState()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <RotateCcw className="h-4 w-4" /> Team
        </button>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <input
          data-testid="enterprise-team-invite-email"
          type="email"
          value={teamInviteEmail}
          onChange={(event) => onTeamInviteEmailChange(event.currentTarget.value)}
          placeholder="invitee@university.edu"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <select
          value={teamInviteRole}
          onChange={(event) => onTeamInviteRoleChange(event.currentTarget.value as EnterpriseRole)}
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        >
          {enterpriseRoleOptions.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <button data-testid="enterprise-team-invite-submit" type="button" onClick={() => void onCreateTeamInvitation()} disabled={disabled || !teamInviteEmail.trim()} className={buttonStyles({ variant: "dark", size: "sm" })}>
          <UsersRound className="h-4 w-4" /> Invite
        </button>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input
          data-testid="enterprise-team-accept-code"
          value={teamInviteCode}
          onChange={(event) => onTeamInviteCodeChange(event.currentTarget.value)}
          placeholder="Paste invitation code"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <button type="button" onClick={() => void onAcceptTeamInvitation()} disabled={disabled || !teamInviteCode.trim()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <CheckCircle2 className="h-4 w-4" /> Accept invite
        </button>
      </div>
      <div className="grid gap-2">
        <div className="text-xs font-black uppercase text-muted">Members</div>
        {!enterpriseTeamState && (
          <div data-testid="enterprise-team-member-row" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
            Sign in to load team memberships.
          </div>
        )}
        {enterpriseTeamState && enterpriseTeamMemberships.length === 0 && (
          <div data-testid="enterprise-team-member-row" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
            No memberships loaded for this team.
          </div>
        )}
        {enterpriseTeamMemberships.slice(0, 6).map((membership) => {
          const user = enterpriseTeamUsersById.get(membership.userId);
          const isSelf = membership.userId === enterpriseUserId;
          const membershipRoleOptions: EnterpriseRole[] = membership.role === "owner" ? ["owner", ...enterpriseRoleOptions] : enterpriseRoleOptions;
          return (
            <div key={membership.id} data-testid="enterprise-team-member-row" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] lg:items-center">
              <div className="min-w-0">
                <div className="truncate font-black text-foreground">{user?.name ?? user?.email ?? membership.userId}</div>
                <div className="truncate">{user?.email ?? membership.userId}</div>
              </div>
              <select
                aria-label={`Role for ${user?.name ?? user?.email ?? membership.userId}`}
                value={membership.role}
                onChange={(event) => void onUpdateTeamMembership(membership.id, { role: event.currentTarget.value as EnterpriseRole })}
                disabled={busy || membership.role === "owner"}
                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-bold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
              >
                {membershipRoleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select
                aria-label={`Status for ${user?.name ?? user?.email ?? membership.userId}`}
                value={membership.status}
                onChange={(event) => void onUpdateTeamMembership(membership.id, { status: event.currentTarget.value as "active" | "suspended" })}
                disabled={busy || membership.role === "owner"}
                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-bold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
              >
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
              <div className="whitespace-nowrap text-[11px] uppercase text-muted/80">
                {isSelf ? "Current user" : new Date(membership.updatedAt).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2">
        <div className="text-xs font-black uppercase text-muted">Pending invites</div>
        {!enterpriseTeamState && (
          <div data-testid="enterprise-team-pending-invite" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
            Sign in to load pending invitations.
          </div>
        )}
        {enterpriseTeamState && pendingEnterpriseInvitations.length === 0 && (
          <div data-testid="enterprise-team-pending-invite" className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted">
            No pending invitations for this team.
          </div>
        )}
        {pendingEnterpriseInvitations.slice(0, 4).map((invitation) => (
          <div key={invitation.id} data-testid="enterprise-team-pending-invite" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="truncate font-black text-foreground">{invitation.email}</div>
              <div className="truncate">{invitation.role} · {new Date(invitation.createdAt).toLocaleString()}</div>
              <code className="mt-1 block break-all rounded border border-cardBorder/35 bg-background/55 px-2 py-1 text-[11px] text-muted">{invitation.inviteCode}</code>
            </div>
            <button type="button" onClick={() => void onRevokeTeamInvitation(invitation.id)} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <X className="h-4 w-4" /> Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
