import { SenaEnterpriseError } from "./errors";
import {
  mutateEnterpriseDbAtomically,
  mutateEnterpriseStateAtomically,
  type SenaEnterpriseDb
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

export type SenaEnterpriseLoginInput = {
  email: string;
  password: string;
  mfaCode?: string;
  mfaChallengeToken?: string;
  rememberSession?: boolean;
};

function loginEnterpriseUserInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterpriseLoginInput
): SenaEnterpriseLoginResult {
  const email = normalizeEmail(input.email);
  const user = db.users.find((candidate) => candidate.email === email);
  const existingLockout = findAuthLockout(db, email);
  if (isAuthLockoutActive(existingLockout)) {
    appendLockedLoginAudit(db, email, user, existingLockout!);
    throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    const failedLockout = recordFailedLogin(db, email, user);
    if (isAuthLockoutActive(failedLockout)) {
      throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
    }
    throw new SenaEnterpriseError("Email or password is incorrect.", 401, "invalid_credentials");
  }

  if (activeMfaFactor(db, user.id)) {
    if (!input.mfaCode || !input.mfaChallengeToken) {
      const challenge = createMfaChallenge(db, user);
      return challenge;
    }
    try {
      verifyMfaChallenge(db, user, {
        mfaCode: input.mfaCode,
        mfaChallengeToken: input.mfaChallengeToken
      });
    } catch (error) {
      // Only a rejected code counts toward the lockout — a sealed-secret failure
      // is a server fault and must not lock the account holder out.
      if (!(error instanceof SenaEnterpriseError) || error.code !== "invalid_mfa_code") throw error;
      const failedLockout = recordFailedLogin(db, email, user, "mfa");
      if (isAuthLockoutActive(failedLockout)) {
        throw new SenaEnterpriseError("Too many failed login attempts. Try again later.", 429, "auth_locked");
      }
      throw error;
    }
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
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export function loginEnterpriseUser(input: SenaEnterpriseLoginInput): SenaEnterpriseLoginResult {
  const outcome = mutateEnterpriseDbAtomically((db) => {
    try {
      return { ok: true as const, result: loginEnterpriseUserInDb(db, input) };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}

export async function loginEnterpriseUserAsync(input: SenaEnterpriseLoginInput): Promise<SenaEnterpriseLoginResult> {
  return mutateEnterpriseStateAtomically((db) => loginEnterpriseUserInDb(db, input));
}
