import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { rolePermissions } from "./access-control";
import { csrfKeySource, envValue, now, sha256Text } from "./auth-config";
import { tokenHash } from "./auth-password";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  mutateEnterpriseDbAtomically,
  mutateEnterpriseStateAtomically,
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseTeam,
  type SenaEnterpriseUser
} from "./state";
import type { SenaEnterpriseMembership } from "./team-memberships";

export const senaSessionCookieName = "sena_session";
export const senaCsrfHeaderName = "x-sena-csrf-token";

const standardSessionDays = 7;
const rememberedSessionDays = 30;
const sessionDays = standardSessionDays;

export type SenaEnterpriseSessionProfile = "standard" | "remembered";

export type SenaEnterpriseSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  sessionProfile: SenaEnterpriseSessionProfile;
  ttlDays: number;
};

export type SenaEnterpriseSessionSummary = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  sessionProfile: SenaEnterpriseSessionProfile;
  ttlDays: number;
};

export type SenaEnterpriseSessionList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSessionList;
  generatedAt: string;
  currentSessionId: string;
  sessionDays: number;
  sessionPolicy: {
    standardDays: number;
    rememberedDays: number;
  };
  sessions: SenaEnterpriseSessionSummary[];
};

export type SenaEnterpriseSessionRevocation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSessionRevocation;
  generatedAt: string;
  revokedSessionIds: string[];
  revokedCount: number;
  currentSessionRevoked: boolean;
  remainingSessions: SenaEnterpriseSessionSummary[];
};

export type SenaEnterpriseCsrfToken = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCsrfToken;
  generatedAt: string;
  headerName: "x-sena-csrf-token";
  token: string;
  sessionId: string;
  expiresAt: string;
  keySource: "env-configured" | "session-secret" | "local-default-review";
};

export type SenaEnterpriseSessionContext = {
  user: SenaEnterpriseUser;
  session: SenaEnterpriseSession;
  memberships: SenaEnterpriseMembership[];
  teams: SenaEnterpriseTeam[];
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function csrfTokenMessage(session: SenaEnterpriseSession) {
  return [session.id, session.userId, session.expiresAt, session.tokenHash].join(".");
}

function csrfKeyMaterial() {
  return envValue("SENA_CSRF_SECRET") || envValue("SENA_SESSION_SECRET") || "sena-local-enterprise-csrf-key";
}

function csrfTokenForSession(session: SenaEnterpriseSession) {
  return `${session.id}.${createHmac("sha256", csrfKeyMaterial()).update(csrfTokenMessage(session)).digest("base64url")}`;
}

function timingSafeStringEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function sessionExpiry(ttlDays = sessionDays) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

export function createSession(db: SenaEnterpriseDb, userId: string, input: { rememberSession?: boolean } = {}) {
  const rawToken = randomBytes(32).toString("base64url");
  const sessionProfile: SenaEnterpriseSessionProfile = input.rememberSession ? "remembered" : "standard";
  const ttlDays = sessionProfile === "remembered" ? rememberedSessionDays : standardSessionDays;
  const session: SenaEnterpriseSession = {
    id: id("sess"),
    userId,
    tokenHash: tokenHash(rawToken),
    createdAt: now(),
    expiresAt: sessionExpiry(ttlDays),
    sessionProfile,
    ttlDays
  };
  db.sessions.push(session);
  return { rawToken, session };
}

function publicUser(user: SenaEnterpriseUser) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function sessionSummary(session: SenaEnterpriseSession, currentSessionId: string): SenaEnterpriseSessionSummary {
  const sessionProfile = session.sessionProfile ?? "standard";
  const ttlDays = session.ttlDays ?? (sessionProfile === "remembered" ? rememberedSessionDays : standardSessionDays);
  return {
    id: session.id,
    current: session.id === currentSessionId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    expiresInSeconds: Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
    sessionProfile,
    ttlDays
  };
}

function liveUserSessions(db: SenaEnterpriseDb, userId: string) {
  return db.sessions
    .filter((session) => session.userId === userId && Date.parse(session.expiresAt) > Date.now())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function contextFromDb(db: SenaEnterpriseDb, session: SenaEnterpriseSession): SenaEnterpriseSessionContext {
  if (Date.parse(session.expiresAt) <= Date.now()) throw new SenaEnterpriseError("Session expired.", 401, "session_expired");
  const user = db.users.find((candidate) => candidate.id === session.userId);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  const memberships = db.memberships.filter((membership) => membership.userId === user.id && membership.status === "active");
  const teamIds = new Set(memberships.map((membership) => membership.teamId));
  const teams = db.teams.filter((team) => teamIds.has(team.id));
  return { user, session, memberships, teams };
}

export function sanitizeEnterpriseContext(context: SenaEnterpriseSessionContext) {
  return {
    user: publicUser(context.user),
    session: {
      id: context.session.id,
      createdAt: context.session.createdAt,
      expiresAt: context.session.expiresAt,
      sessionProfile: context.session.sessionProfile,
      ttlDays: context.session.ttlDays
    },
    memberships: context.memberships,
    teams: context.teams,
    permissions: context.memberships.flatMap((membership) => rolePermissions[membership.role].map((permission) => ({
      teamId: membership.teamId,
      permission
    })))
  };
}

export function logoutEnterpriseSession(token: string | undefined) {
  if (!token) return;
  mutateEnterpriseDbAtomically((db) => {
    const hash = tokenHash(token);
    const session = db.sessions.find((candidate) => candidate.tokenHash === hash);
    db.sessions = db.sessions.filter((candidate) => candidate.tokenHash !== hash);
    if (session) appendAudit(db, { event: "auth.logout", userId: session.userId, detail: { sessionId: session.id } });
  });
}

export async function logoutEnterpriseSessionAsync(token: string | undefined) {
  if (!token) return;
  await mutateEnterpriseStateAtomically((db) => {
    const hash = tokenHash(token);
    const session = db.sessions.find((candidate) => candidate.tokenHash === hash);
    db.sessions = db.sessions.filter((candidate) => candidate.tokenHash !== hash);
    if (session) appendAudit(db, { event: "auth.logout", userId: session.userId, detail: { sessionId: session.id } });
  });
}

export function listEnterpriseSessions(context: SenaEnterpriseSessionContext): SenaEnterpriseSessionList {
  const db = readEnterpriseDb();
  const sessions = liveUserSessions(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionList,
    generatedAt: now(),
    currentSessionId: context.session.id,
    sessionDays,
    sessionPolicy: {
      standardDays: standardSessionDays,
      rememberedDays: rememberedSessionDays
    },
    sessions: sessions.map((session) => sessionSummary(session, context.session.id))
  };
}

export async function listEnterpriseSessionsAsync(context: SenaEnterpriseSessionContext): Promise<SenaEnterpriseSessionList> {
  const state = await readEnterpriseState();
  const db = state.db;
  const sessions = liveUserSessions(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionList,
    generatedAt: now(),
    currentSessionId: context.session.id,
    sessionDays,
    sessionPolicy: {
      standardDays: standardSessionDays,
      rememberedDays: rememberedSessionDays
    },
    sessions: sessions.map((session) => sessionSummary(session, context.session.id))
  };
}

export function createEnterpriseCsrfToken(context: SenaEnterpriseSessionContext): SenaEnterpriseCsrfToken {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCsrfToken,
    generatedAt: now(),
    headerName: senaCsrfHeaderName,
    token: csrfTokenForSession(context.session),
    sessionId: context.session.id,
    expiresAt: context.session.expiresAt,
    keySource: csrfKeySource()
  };
}

export function verifyEnterpriseCsrfToken(context: SenaEnterpriseSessionContext, token: string | null | undefined) {
  const expected = csrfTokenForSession(context.session);
  const valid = typeof token === "string" && token.length > 0 && timingSafeStringEqual(token, expected);
  if (!valid) {
    mutateEnterpriseDbAtomically((db) => {
      appendAudit(db, {
        event: "security.csrf.fail",
        userId: context.user.id,
        teamId: context.teams[0]?.id,
        detail: {
          sessionId: context.session.id,
          tokenPresent: Boolean(token),
          tokenHash: token ? (sha256Text(token) ?? null) : null,
          headerName: senaCsrfHeaderName
        }
      });
    });
    throw new SenaEnterpriseError("CSRF token is missing or invalid.", 403, "csrf_invalid");
  }
  return true;
}

export async function verifyEnterpriseCsrfTokenAsync(context: SenaEnterpriseSessionContext, token: string | null | undefined) {
  const expected = csrfTokenForSession(context.session);
  const valid = typeof token === "string" && token.length > 0 && timingSafeStringEqual(token, expected);
  if (!valid) {
    await mutateEnterpriseStateAtomically((db) => {
      appendAudit(db, {
        event: "security.csrf.fail",
        userId: context.user.id,
        teamId: context.teams[0]?.id,
        detail: {
          sessionId: context.session.id,
          tokenPresent: Boolean(token),
          tokenHash: token ? (sha256Text(token) ?? null) : null,
          headerName: senaCsrfHeaderName
        }
      });
    });
    throw new SenaEnterpriseError("CSRF token is missing or invalid.", 403, "csrf_invalid");
  }
  return true;
}

export function revokeEnterpriseSessions(context: SenaEnterpriseSessionContext, input: {
  sessionId?: string;
  revokeOtherSessions?: boolean;
  revokeAllSessions?: boolean;
} = {}): SenaEnterpriseSessionRevocation {
  return mutateEnterpriseDbAtomically((db) => revokeEnterpriseSessionsFromDb(context, input, db));
}

function revokeEnterpriseSessionsFromDb(
  context: SenaEnterpriseSessionContext,
  input: { sessionId?: string; revokeOtherSessions?: boolean; revokeAllSessions?: boolean },
  db: SenaEnterpriseDb
): SenaEnterpriseSessionRevocation {
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  const userSessions = liveUserSessions(db, context.user.id);
  const targetIds = new Set<string>();
  if (input.revokeAllSessions) {
    userSessions.forEach((session) => targetIds.add(session.id));
  } else if (input.revokeOtherSessions) {
    userSessions
      .filter((session) => session.id !== context.session.id)
      .forEach((session) => targetIds.add(session.id));
  } else if (input.sessionId) {
    const session = userSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session) throw new SenaEnterpriseError("Session was not found.", 404, "session_not_found");
    targetIds.add(session.id);
  } else {
    throw new SenaEnterpriseError("A sessionId or revoke action is required.", 400, "session_revoke_target_required");
  }

  const revokedSessionIds = userSessions
    .filter((session) => targetIds.has(session.id))
    .map((session) => session.id);
  db.sessions = db.sessions.filter((session) => !targetIds.has(session.id));
  appendAudit(db, {
    event: "auth.session.revoke",
    userId: context.user.id,
    teamId: context.teams[0]?.id,
    detail: {
      revokedCount: revokedSessionIds.length,
      currentSessionRevoked: revokedSessionIds.includes(context.session.id),
      mode: input.revokeAllSessions ? "all" : input.revokeOtherSessions ? "others" : "single"
    }
  });
  const remainingSessions = liveUserSessions(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSessionRevocation,
    generatedAt: now(),
    revokedSessionIds,
    revokedCount: revokedSessionIds.length,
    currentSessionRevoked: revokedSessionIds.includes(context.session.id),
    remainingSessions: remainingSessions.map((session) => sessionSummary(session, context.session.id))
  };
}

export async function revokeEnterpriseSessionsAsync(context: SenaEnterpriseSessionContext, input: {
  sessionId?: string;
  revokeOtherSessions?: boolean;
  revokeAllSessions?: boolean;
} = {}): Promise<SenaEnterpriseSessionRevocation> {
  return mutateEnterpriseStateAtomically((db) => revokeEnterpriseSessionsFromDb(context, input, db));
}

export function getEnterpriseSession(token: string | undefined): SenaEnterpriseSessionContext | null {
  if (!token) return null;
  const db = readEnterpriseDb();
  const session = db.sessions.find((candidate) => candidate.tokenHash === tokenHash(token));
  if (!session) return null;
  return contextFromDb(db, session);
}

export async function getEnterpriseSessionAsync(token: string | undefined): Promise<SenaEnterpriseSessionContext | null> {
  if (!token) return null;
  const state = await readEnterpriseState();
  const session = state.db.sessions.find((candidate) => candidate.tokenHash === tokenHash(token));
  if (!session) return null;
  return contextFromDb(state.db, session);
}

export function requireEnterpriseSession(token: string | undefined): SenaEnterpriseSessionContext {
  const context = getEnterpriseSession(token);
  if (!context) throw new SenaEnterpriseError("Sign in is required.", 401, "auth_required");
  return context;
}

export async function requireEnterpriseSessionAsync(token: string | undefined): Promise<SenaEnterpriseSessionContext> {
  const context = await getEnterpriseSessionAsync(token);
  if (!context) throw new SenaEnterpriseError("Sign in is required.", 401, "auth_required");
  return context;
}
