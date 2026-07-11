import {
  requireEnterprisePermission,
  rolePermissions,
  type SenaEnterpriseRole
} from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseProvisioningMetadata } from "./provisioning";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";

export type SenaEnterpriseMembership = {
  id: string;
  teamId: string;
  userId: string;
  role: SenaEnterpriseRole;
  status: "active" | "suspended";
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

function now() {
  return new Date().toISOString();
}

function publicUser(user: SenaEnterpriseUser) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function listEnterpriseTeamStateFromDb(db: SenaEnterpriseDb, context: SenaEnterpriseSessionContext) {
  const teamIds = new Set(context.teams.map((team) => team.id));
  return {
    teams: context.teams,
    memberships: db.memberships.filter((membership) => teamIds.has(membership.teamId)),
    users: db.users
      .filter((user) => db.memberships.some((membership) => membership.userId === user.id && teamIds.has(membership.teamId)))
      .map(publicUser),
    invitations: db.invitations.filter((invitation) => teamIds.has(invitation.teamId)),
    uploads: db.uploads.filter((upload) => teamIds.has(upload.teamId)),
    importRuns: db.importRuns.filter((run) => teamIds.has(run.teamId)),
    analysisRuns: db.analysisRuns.filter((run) => teamIds.has(run.teamId)),
    reliabilityRuns: db.reliabilityRuns.filter((run) => teamIds.has(run.teamId)),
    validationRuns: db.validationRuns.filter((run) => teamIds.has(run.teamId)),
    expertReviews: db.expertReviews.filter((review) => teamIds.has(review.teamId)),
    notifications: db.notifications.filter((notification) => !notification.teamId || teamIds.has(notification.teamId)),
    auditLog: db.auditLog.filter((entry) => !entry.teamId || teamIds.has(entry.teamId)).slice(0, 100)
  };
}

export function listEnterpriseTeamState(context: SenaEnterpriseSessionContext) {
  return listEnterpriseTeamStateFromDb(readEnterpriseDb(), context);
}

export async function listEnterpriseTeamStateAsync(context: SenaEnterpriseSessionContext) {
  const state = await readEnterpriseState();
  return listEnterpriseTeamStateFromDb(state.db, context);
}

function activeTeamManagerCount(db: SenaEnterpriseDb, teamId: string, override?: {
  membershipId: string;
  role: SenaEnterpriseRole;
  status: SenaEnterpriseMembership["status"];
}) {
  return db.memberships.filter((membership) => {
    const role = override?.membershipId === membership.id ? override.role : membership.role;
    const status = override?.membershipId === membership.id ? override.status : membership.status;
    return membership.teamId === teamId && status === "active" && rolePermissions[role].includes("team:manage");
  }).length;
}

export type SenaEnterpriseMembershipUpdateInput = {
  role?: SenaEnterpriseRole;
  status?: SenaEnterpriseMembership["status"];
};

function updateEnterpriseMembershipInDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  membershipId: string,
  input: SenaEnterpriseMembershipUpdateInput
) {
  const membership = db.memberships.find((candidate) => candidate.id === membershipId);
  if (!membership) throw new SenaEnterpriseError("Membership was not found.", 404, "membership_not_found");
  requireEnterprisePermission(context, membership.teamId, "team:manage");

  const nextRole = input.role ?? membership.role;
  const nextStatus = input.status ?? membership.status;
  if (!rolePermissions[nextRole]) {
    throw new SenaEnterpriseError("Unsupported SENA team role.", 400, "unsupported_team_role");
  }
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    throw new SenaEnterpriseError("Unsupported SENA membership status.", 400, "unsupported_membership_status");
  }
  if (activeTeamManagerCount(db, membership.teamId, { membershipId, role: nextRole, status: nextStatus }) === 0) {
    throw new SenaEnterpriseError("At least one active PI or owner must keep team management permission.", 400, "last_team_manager_required");
  }

  const previousRole = membership.role;
  const previousStatus = membership.status;
  membership.role = nextRole;
  membership.status = nextStatus;
  membership.updatedAt = now();

  appendAudit(db, {
    event: "team.membership.update",
    userId: context.user.id,
    teamId: membership.teamId,
    detail: {
      membershipId,
      targetUserId: membership.userId,
      previousRole,
      role: membership.role,
      previousStatus,
      status: membership.status
    }
  });
  return membership;
}

export function updateEnterpriseMembership(
  context: SenaEnterpriseSessionContext,
  membershipId: string,
  input: SenaEnterpriseMembershipUpdateInput
) {
  const db = readEnterpriseDb();
  const membership = updateEnterpriseMembershipInDb(db, context, membershipId, input);
  saveDb(db);
  return membership;
}

export async function updateEnterpriseMembershipAsync(
  context: SenaEnterpriseSessionContext,
  membershipId: string,
  input: SenaEnterpriseMembershipUpdateInput
) {
  const state = await readEnterpriseState();
  const membership = updateEnterpriseMembershipInDb(state.db, context, membershipId, input);
  await saveEnterpriseState(state, state.db);
  return membership;
}
