import { randomBytes } from "node:crypto";
import { type SenaEnterpriseRole } from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseTeam,
  type SenaEnterpriseUser
} from "./state";
import { appendAudit } from "./ops-audit";
import {
  hashPassword,
  normalizeEmail,
  validateEnterprisePassword
} from "./auth-password";
import {
  enforceEnterpriseAuthSubjectRateLimit,
  enforceEnterpriseAuthSubjectRateLimitAsync
} from "./auth-security";
import {
  contextFromDb,
  createSession
} from "./auth-session";
import { now } from "./auth-config";
import { requirePendingInvitationForEmail } from "./auth-invitations";

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export type SenaEnterpriseRegistrationInput = {
  name: string;
  email: string;
  password: string;
  organization: string;
  plan?: SenaEnterpriseTeam["plan"];
  inviteCode?: string;
  // Onboarding context the registrant declares about themselves. It is recorded
  // with the registration only — membership role stays driven by the invitation
  // or by workspace ownership, never by anything the registrant can choose.
  selfDeclaredRole?: string;
  productUpdates?: boolean;
};

function registerEnterpriseUserInDb(
  db: ReturnType<typeof readEnterpriseDb>,
  input: SenaEnterpriseRegistrationInput
) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new SenaEnterpriseError("A valid email is required.", 400, "invalid_email");
  validateEnterprisePassword(input.password, email);

  if (db.users.some((user) => user.email === email)) {
    throw new SenaEnterpriseError("An account already exists for this email.", 409, "email_exists");
  }

  const timestamp = now();
  const user: SenaEnterpriseUser = {
    id: id("user"),
    email,
    name: input.name.trim() || email.split("@")[0],
    organization: input.organization.trim() || email.split("@")[1] || "SENA Research Team",
    passwordHash: hashPassword(input.password),
    ssoIdentities: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.users.push(user);

  const pendingInvite = requirePendingInvitationForEmail(db, input.inviteCode, email);

  let team: SenaEnterpriseTeam;
  let role: SenaEnterpriseRole;
  if (pendingInvite) {
    const invitedTeam = db.teams.find((candidate) => candidate.id === pendingInvite.teamId);
    if (!invitedTeam) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
    team = invitedTeam;
    role = pendingInvite.role;
    pendingInvite.status = "accepted";
    pendingInvite.acceptedAt = timestamp;
  } else {
    team = {
      id: id("team"),
      name: input.organization.trim() || `${user.name}'s SENA Workspace`,
      plan: input.plan ?? "lab",
      organization: user.organization,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.teams.push(team);
    role = "owner";
  }

  db.memberships.push({
    id: id("member"),
    teamId: team.id,
    userId: user.id,
    role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  });

  const session = createSession(db, user.id);
  appendAudit(db, {
    event: "auth.register",
    userId: user.id,
    teamId: team.id,
    detail: {
      plan: team.plan,
      role,
      selfDeclaredRole: input.selfDeclaredRole?.trim().slice(0, 80) || null,
      productUpdatesOptIn: input.productUpdates === true
    }
  });
  if (pendingInvite) {
    appendAudit(db, {
      event: "team.invite.accept",
      userId: user.id,
      teamId: pendingInvite.teamId,
      detail: {
        invitationId: pendingInvite.id,
        role: pendingInvite.role,
        method: "registration"
      }
    });
  }
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export function registerEnterpriseUser(input: SenaEnterpriseRegistrationInput) {
  enforceEnterpriseAuthSubjectRateLimit({ bucket: "auth.register", subject: normalizeEmail(input.email) });
  const db = readEnterpriseDb();
  const result = registerEnterpriseUserInDb(db, input);
  saveDb(db);
  return result;
}

export async function registerEnterpriseUserAsync(input: SenaEnterpriseRegistrationInput) {
  await enforceEnterpriseAuthSubjectRateLimitAsync({ bucket: "auth.register", subject: normalizeEmail(input.email) });
  const state = await readEnterpriseState();
  const result = registerEnterpriseUserInDb(state.db, input);
  await saveEnterpriseState(state, state.db);
  return result;
}
