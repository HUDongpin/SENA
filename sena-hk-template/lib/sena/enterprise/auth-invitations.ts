import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  requireEnterprisePermission,
  type SenaEnterpriseRole
} from "./access-control";
import { contextFromDb, type SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import {
  queueEnterpriseEmail
} from "./notifications-email";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseDb } from "./state";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState
} from "./state";
import type { SenaEnterpriseMembership } from "./team-memberships";

export type SenaEnterpriseInvitation = {
  id: string;
  teamId: string;
  email: string;
  role: SenaEnterpriseRole;
  inviteCode: string;
  status: "pending" | "accepted" | "revoked";
  invitedBy: string;
  createdAt: string;
  acceptedAt?: string;
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizedBaseUrl(baseUrl?: string) {
  const candidate = (baseUrl || process.env.SENA_APP_URL || process.env.NEXT_PUBLIC_SENA_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  try {
    return new URL(candidate).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL for OAuth/OIDC SSO.", 500, "invalid_sso_app_url");
  }
}

function invitationRegisterUrl(inviteCode: string, baseUrl?: string) {
  const url = new URL("/register", normalizedBaseUrl(baseUrl));
  url.searchParams.set("inviteCode", inviteCode);
  return url.toString();
}

export function safeInviteCode(inviteCode?: string) {
  const value = inviteCode?.trim();
  return value ? value.slice(0, 128) : undefined;
}

export function requirePendingInvitationForEmail(db: SenaEnterpriseDb, inviteCode: string | undefined, email: string) {
  const safeCode = safeInviteCode(inviteCode);
  if (!safeCode) return undefined;
  const invitation = db.invitations.find((candidate) => candidate.inviteCode === safeCode);
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  if (invitation.status !== "pending") {
    throw new SenaEnterpriseError("Invitation is no longer pending.", 409, "invitation_not_pending");
  }
  if (invitation.email !== email) {
    throw new SenaEnterpriseError("Invitation email does not match the requested account.", 403, "invitation_email_mismatch");
  }
  return invitation;
}

export type SenaEnterpriseInvitationCreateInput = {
  teamId: string;
  email: string;
  role: SenaEnterpriseRole;
  baseUrl?: string;
};

export type SenaEnterpriseInvitationAcceptInput = {
  invitationId?: string;
  inviteCode?: string;
};

function createEnterpriseInvitationInDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseInvitationCreateInput
) {
  requireEnterprisePermission(context, input.teamId, "member:invite");
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const invitation: SenaEnterpriseInvitation = {
    id: id("invite"),
    teamId: input.teamId,
    email: normalizeEmail(input.email),
    role: input.role,
    inviteCode: randomBytes(9).toString("base64url"),
    status: "pending",
    invitedBy: context.user.id,
    createdAt: now()
  };
  db.invitations.push(invitation);
  const inviteUrl = invitationRegisterUrl(invitation.inviteCode, input.baseUrl);
  const emailDelivery = queueEnterpriseEmail(db, {
    kind: "team.invite",
    recipientEmail: invitation.email,
    teamId: input.teamId,
    userId: context.user.id,
    subject: `Invitation to ${team.name} on SENA`,
    bodyText: `${context.user.name} invited you to ${team.name} as ${invitation.role}. Use the secure invitation link to create or join your SENA account.`,
    actionUrl: inviteUrl,
    templateData: {
      invitationId: invitation.id,
      inviteCode: invitation.inviteCode,
      teamName: team.name,
      role: invitation.role,
      invitedBy: context.user.id,
      invitedByName: context.user.name
    }
  });
  appendAudit(db, {
    event: "team.invite",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      email: invitation.email,
      role: invitation.role,
      emailDeliveryId: emailDelivery?.id ?? null
    }
  });
  queueEnterpriseNotification(db, {
    kind: "team.invite",
    email: invitation.email,
    teamId: input.teamId,
    title: "SENA team invitation",
    body: `${context.user.name} invited you to ${team.name} as ${invitation.role}.`,
    actionUrl: inviteUrl,
    detail: {
      invitationId: invitation.id,
      role: invitation.role,
      invitedBy: context.user.id,
      emailDeliveryId: emailDelivery?.id ?? null
    }
  });
  return invitation;
}

export function createEnterpriseInvitation(context: SenaEnterpriseSessionContext, input: SenaEnterpriseInvitationCreateInput) {
  const db = readEnterpriseDb();
  const invitation = createEnterpriseInvitationInDb(db, context, input);
  saveDb(db);
  return invitation;
}

export async function createEnterpriseInvitationAsync(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseInvitationCreateInput
) {
  const state = await readEnterpriseState();
  const invitation = createEnterpriseInvitationInDb(state.db, context, input);
  await saveEnterpriseState(state, state.db);
  return invitation;
}

function acceptEnterpriseInvitationInDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseInvitationAcceptInput
) {
  const invitationId = input.invitationId?.trim();
  const inviteCode = input.inviteCode?.trim();
  if (!invitationId && !inviteCode) {
    throw new SenaEnterpriseError("Invitation ID or invite code is required.", 400, "invitation_reference_required");
  }

  const invitation = db.invitations.find((candidate) => (
    invitationId ? candidate.id === invitationId : candidate.inviteCode === inviteCode
  ));
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  if (invitation.status !== "pending") {
    throw new SenaEnterpriseError("Invitation is no longer pending.", 409, "invitation_not_pending");
  }
  if (normalizeEmail(context.user.email) !== invitation.email) {
    throw new SenaEnterpriseError("Invitation email does not match the signed-in user.", 403, "invitation_email_mismatch");
  }
  const team = db.teams.find((candidate) => candidate.id === invitation.teamId);
  if (!team) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
  if (db.memberships.some((membership) => membership.teamId === invitation.teamId && membership.userId === context.user.id)) {
    throw new SenaEnterpriseError("The signed-in user is already a member of this team.", 409, "membership_already_exists");
  }

  const timestamp = now();
  const membership: SenaEnterpriseMembership = {
    id: id("member"),
    teamId: invitation.teamId,
    userId: context.user.id,
    role: invitation.role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.memberships.push(membership);
  invitation.status = "accepted";
  invitation.acceptedAt = timestamp;
  appendAudit(db, {
    event: "team.invite.accept",
    userId: context.user.id,
    teamId: invitation.teamId,
    detail: {
      invitationId: invitation.id,
      role: invitation.role,
      method: invitationId ? "invitation-id" : "invite-code"
    }
  });
  const session = db.sessions.find((candidate) => candidate.id === context.session.id) ?? context.session;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.teamInvitationAcceptance,
    invitation,
    membership,
    context: contextFromDb(db, session)
  };
}

export function acceptEnterpriseInvitation(context: SenaEnterpriseSessionContext, input: SenaEnterpriseInvitationAcceptInput) {
  const db = readEnterpriseDb();
  const accepted = acceptEnterpriseInvitationInDb(db, context, input);
  saveDb(db);
  return accepted;
}

export async function acceptEnterpriseInvitationAsync(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseInvitationAcceptInput
) {
  const state = await readEnterpriseState();
  const accepted = acceptEnterpriseInvitationInDb(state.db, context, input);
  await saveEnterpriseState(state, state.db);
  return accepted;
}

function revokeEnterpriseInvitationInDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  invitationId: string
) {
  const invitation = db.invitations.find((candidate) => candidate.id === invitationId);
  if (!invitation) throw new SenaEnterpriseError("Invitation was not found.", 404, "invitation_not_found");
  requireEnterprisePermission(context, invitation.teamId, "member:invite");
  if (invitation.status === "accepted") {
    throw new SenaEnterpriseError("Accepted invitations cannot be revoked.", 409, "invitation_already_accepted");
  }
  invitation.status = "revoked";
  appendAudit(db, {
    event: "team.invite.revoke",
    userId: context.user.id,
    teamId: invitation.teamId,
    detail: {
      invitationId,
      email: invitation.email,
      role: invitation.role
    }
  });
  return invitation;
}

export function revokeEnterpriseInvitation(context: SenaEnterpriseSessionContext, invitationId: string) {
  const db = readEnterpriseDb();
  const invitation = revokeEnterpriseInvitationInDb(db, context, invitationId);
  saveDb(db);
  return invitation;
}

export async function revokeEnterpriseInvitationAsync(context: SenaEnterpriseSessionContext, invitationId: string) {
  const state = await readEnterpriseState();
  const invitation = revokeEnterpriseInvitationInDb(state.db, context, invitationId);
  await saveEnterpriseState(state, state.db);
  return invitation;
}
