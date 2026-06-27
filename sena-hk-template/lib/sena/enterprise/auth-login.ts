import { SenaEnterpriseError } from "./errors";
import {
  readEnterpriseDb,
  saveDb
} from "./state";
import { appendAudit } from "./ops-audit";
import {
  activeMfaFactor,
  createMfaChallenge,
  verifyMfaChallenge,
  type SenaEnterpriseLoginMfaChallenge
} from "./auth-mfa";
import {
  appendLockedLoginAudit,
  clearFailedLogin,
  findAuthLockout,
  isAuthLockoutActive,
  recordFailedLogin
} from "./auth-security";
import {
  normalizeEmail,
  verifyPassword
} from "./auth-password";
import {
  contextFromDb,
  createSession,
  type SenaEnterpriseSessionContext
} from "./auth-session";

export type SenaEnterpriseLoginResult =
  | { token: string; context: SenaEnterpriseSessionContext }
  | SenaEnterpriseLoginMfaChallenge;

export function loginEnterpriseUser(input: {
  email: string;
  password: string;
  mfaCode?: string;
  mfaChallengeToken?: string;
  rememberSession?: boolean;
}): SenaEnterpriseLoginResult {
  const db = readEnterpriseDb();
  const email = normalizeEmail(input.email);
  const user = db.users.find((candidate) => candidate.email === email);
  const existingLockout = findAuthLockout(db, email);
  if (isAuthLockoutActive(existingLockout)) {
    appendLockedLoginAudit(db, email, user, existingLockout!);
    saveDb(db);
    throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    const failedLockout = recordFailedLogin(db, email, user);
    saveDb(db);
    if (isAuthLockoutActive(failedLockout)) {
      throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
    }
    throw new SenaEnterpriseError("Email or password is incorrect.", 401, "invalid_credentials");
  }

  if (activeMfaFactor(db, user.id)) {
    if (!input.mfaCode || !input.mfaChallengeToken) {
      const challenge = createMfaChallenge(db, user);
      saveDb(db);
      return challenge;
    }
    verifyMfaChallenge(db, user, {
      mfaCode: input.mfaCode,
      mfaChallengeToken: input.mfaChallengeToken
    });
  }

  clearFailedLogin(db, email);
  const session = createSession(db, user.id, { rememberSession: input.rememberSession });
  appendAudit(db, {
    event: "auth.login",
    userId: user.id,
    detail: {
      method: "password",
      mfa: Boolean(activeMfaFactor(db, user.id)),
      sessionProfile: session.session.sessionProfile,
      ttlDays: session.session.ttlDays
    }
  });
  saveDb(db);
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}
