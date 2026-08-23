import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function wrongTotpCode(secret: string) {
  return totpCode(secret) === "000000" ? "111111" : "000000";
}

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const enterpriseDbDirs: string[] = [];

type EnterpriseDbFile = {
  emailDeliveries: Array<{ id: string; kind: string; status: string }>;
  passwordResetRequests: Array<{ id: string; emailHash: string; tokenHash: string; createdAt: string }>;
  apiRateLimits: Array<{ bucket: string; keyHash: string; requestCount: number; limit: number }>;
  auditLog: Array<{ event: string; detail: Record<string, unknown> }>;
};

function enterpriseTempDbDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  enterpriseDbDirs.push(dir);
  process.env.SENA_ENTERPRISE_DB_DIR = dir;
  return dir;
}

function readEnterpriseDbFile(dir: string): EnterpriseDbFile {
  const parsed = JSON.parse(readFileSync(path.join(dir, "enterprise-db.json"), "utf8")) as Partial<EnterpriseDbFile>;
  return {
    emailDeliveries: parsed.emailDeliveries ?? [],
    passwordResetRequests: parsed.passwordResetRequests ?? [],
    apiRateLimits: parsed.apiRateLimits ?? [],
    auditLog: parsed.auditLog ?? []
  };
}

function configureEmailWebhook() {
  process.env.SENA_EMAIL_WEBHOOK_URL = "https://mail.example.test/sena";
  process.env.SENA_EMAIL_WEBHOOK_SECRET = "sena-email-webhook-secret-for-tests";
}

function stubAcceptingEmailWebhook() {
  const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function passwordResetRequestBody(email: string) {
  return JSON.stringify({ action: "request", email });
}

afterEach(() => {
  // doMock registrations outlive resetModules, and their cached factory result
  // keeps the enterprise state module pinned to a previous test's temp db dir.
  vi.doUnmock("@/lib/sena/enterprise");
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.doUnmock("@/lib/sena/enterprise/auth-password-reset");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_APP_URL;
  delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
  delete process.env.SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE;
  delete process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES;
  delete process.env.SENA_PASSWORD_RESET_SUBJECT_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH;
  delete process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED;
  delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;
  delete process.env.SENA_EMAIL_WEBHOOK_URL;
  delete process.env.SENA_EMAIL_WEBHOOK_SECRET;
  while (enterpriseDbDirs.length) {
    rmSync(enterpriseDbDirs.pop()!, { recursive: true, force: true });
  }
  vi.resetModules();
});

describe("SENA auth rate-limit key custody (A2)", () => {
  it("keeps one bucket per client IP when the User-Agent header rotates", async () => {
    enterpriseTempDbDir("sena-auth-ratelimit-ua-");
    vi.resetModules();

    const { enforceAuthRateLimit } = await import("../api-helpers");
    function loginAttempt(userAgent: string) {
      return new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7",
          "user-agent": userAgent
        }
      });
    }

    const first = enforceAuthRateLimit(loginAttempt("Mozilla/5.0 (rotation-one)"), {
      bucket: "auth.login",
      discriminator: "victim@example.edu"
    });
    const second = enforceAuthRateLimit(loginAttempt("Mozilla/5.0 (rotation-two)"), {
      bucket: "auth.login",
      discriminator: "victim@example.edu"
    });

    expect(second.keyHash).toBe(first.keyHash);
    expect(first.requestCount).toBe(1);
    expect(second.requestCount).toBe(2);
    expect(second.remaining).toBe(first.remaining - 1);
  });

  // The three tests below pin the deployment assumption requestClientKey documents,
  // rather than a property it holds on its own. They are written to fail if the
  // x-forwarded-for handling is ever changed (right-most hop, trusted-proxy hop
  // count, allowlist) so that the comment cannot silently drift out of date.

  it("keys on the left-most x-forwarded-for entry, ignoring the hops behind it", async () => {
    enterpriseTempDbDir("sena-auth-ratelimit-xff-leftmost-");
    vi.resetModules();

    const { enforceAuthRateLimit } = await import("../api-helpers");
    function loginAttempt(forwardedFor: string) {
      return enforceAuthRateLimit(new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": forwardedFor,
          "user-agent": "Mozilla/5.0 (fixed)"
        }
      }), { bucket: "auth.login", discriminator: "victim@example.edu", limit: 10 });
    }

    // A proxy that appends leaves the value the client sent in front of the hop it
    // observed, and it is the client's value that reaches the key.
    const appended = loginAttempt("198.51.100.1, 203.0.113.7");
    const clientValueOnly = loginAttempt("198.51.100.1");
    const observedHopOnly = loginAttempt("203.0.113.7");

    expect(clientValueOnly.keyHash).toBe(appended.keyHash);
    expect(clientValueOnly.requestCount).toBe(2);
    // The hop the proxy actually saw shares no counter with the pair above, which
    // is what makes an appending proxy insufficient here.
    expect(observedHopOnly.keyHash).not.toBe(appended.keyHash);
    expect(observedHopOnly.requestCount).toBe(1);
  });

  it("mints a fresh bucket for every rotated x-forwarded-for value", async () => {
    enterpriseTempDbDir("sena-auth-ratelimit-xff-rotation-");
    vi.resetModules();

    const { enforceAuthRateLimit } = await import("../api-helpers");
    const rotated = ["198.51.100.1", "198.51.100.2", "198.51.100.3"].map((ip) =>
      enforceAuthRateLimit(new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          "user-agent": "Mozilla/5.0 (fixed)"
        }
      }), { bucket: "auth.login", discriminator: "victim@example.edu", limit: 10 }));

    // Exactly the failure a rotated User-Agent used to cause. This is safe only
    // when SENA is deployed behind a proxy that overwrites x-forwarded-for; expose
    // the app directly and this per-IP limiter stops bounding anything. What still
    // bounds the attempt is the per-subject backstop covered by the tests below.
    expect(new Set(rotated.map((outcome) => outcome.keyHash)).size).toBe(3);
    expect(rotated.map((outcome) => outcome.requestCount)).toEqual([1, 1, 1]);
  });

  it("falls back to x-real-ip only when x-forwarded-for is absent or blank", async () => {
    enterpriseTempDbDir("sena-auth-ratelimit-real-ip-");
    vi.resetModules();

    const { enforceAuthRateLimit } = await import("../api-helpers");
    function loginAttempt(headers: Record<string, string>) {
      return enforceAuthRateLimit(new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers }
      }), { bucket: "auth.login", discriminator: "victim@example.edu", limit: 10 });
    }

    const realIpOnly = loginAttempt({ "x-real-ip": "198.51.100.4" });
    const forwardedSameIp = loginAttempt({ "x-forwarded-for": "198.51.100.4" });
    const blankForwarded = loginAttempt({
      "x-forwarded-for": "   ",
      "x-real-ip": "198.51.100.4"
    });
    const bothHeaders = loginAttempt({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.4"
    });
    const forwardedOnly = loginAttempt({ "x-forwarded-for": "203.0.113.7" });

    // The same address must share a bucket across the two header names. Otherwise
    // an implementation that silently ignores x-real-ip would still pass the
    // precedence assertions below by falling back to the unrelated "local" key.
    expect(forwardedSameIp.keyHash).toBe(realIpOnly.keyHash);
    expect(forwardedSameIp.requestCount).toBe(2);
    expect(blankForwarded.keyHash).toBe(realIpOnly.keyHash);
    expect(blankForwarded.requestCount).toBe(3);

    // x-real-ip is a second potentially client-supplied header, not a more
    // trustworthy one, so it buys nothing when a non-blank x-forwarded-for exists.
    expect(forwardedOnly.keyHash).toBe(bothHeaders.keyHash);
    expect(forwardedOnly.requestCount).toBe(2);
    expect(realIpOnly.keyHash).not.toBe(bothHeaders.keyHash);
    expect(realIpOnly.requestCount).toBe(1);
  });

  it("backstops registration attempts per email even when the source IP rotates", async () => {
    enterpriseTempDbDir("sena-auth-register-subject-");
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    const route = await import("../../../app/api/auth/register/route");
    async function registerAttempt(ip: string) {
      const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          "user-agent": `agent-${ip}`
        },
        body: JSON.stringify({
          name: "Subject Backstop",
          email: "subject-backstop@example.edu",
          password: "sena-secure-123",
          organization: "Backstop Lab"
        })
      }));
      return response.status;
    }

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(await registerAttempt(`203.0.113.${20 + attempt}`));
    }

    expect(statuses.slice(0, 5)).toEqual([201, 409, 409, 409, 409]);
    expect(statuses[5]).toBe(429);
  });

  it("does not spend the registration subject budget on password-policy rejections", async () => {
    enterpriseTempDbDir("sena-auth-register-subject-validation-");
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    const route = await import("../../../app/api/auth/register/route");
    async function registerAttempt(ip: string, password: string) {
      const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          "user-agent": `agent-${ip}`
        },
        body: JSON.stringify({
          name: "Late Registrant",
          email: "late-registrant@example.edu",
          password,
          organization: "Backstop Lab"
        })
      }));
      return response.status;
    }

    // An attacker (or a registrant fighting the password policy) can burn the
    // whole subject budget on requests that never created anything.
    const rejected: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      rejected.push(await registerAttempt(`203.0.113.${40 + attempt}`, "short"));
    }

    expect(rejected).toEqual([400, 400, 400, 400, 400]);
    expect(await registerAttempt("203.0.113.99", "sena-secure-123")).toBe(201);
  });
});

describe("SENA password-reset subject backstop non-starvation (GAP-2)", () => {
  it("keeps the account holder recoverable after one attacker IP spends its whole reset budget", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-holder-starvation-");
    configureEmailWebhook();
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/enterprise/auth-password-reset", async () => await import("../enterprise/auth-password-reset"));

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Reset Holder",
      email: "reset-holder@example.edu",
      password: "sena-secure-123",
      organization: "Backstop Lab"
    });
    stubAcceptingEmailWebhook();

    const route = await import("../../../app/api/auth/password-reset/route");
    async function resetRequest(ip: string) {
      const response = await route.POST(new Request("https://sena.example.test/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: passwordResetRequestBody("reset-holder@example.edu")
      }));
      return response.status;
    }

    const attacker: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      attacker.push(await resetRequest("203.0.113.10"));
    }
    expect(attacker).toEqual([202, 202, 202, 202, 202, 429]);

    // The holder arrives from their own address and must still be able to
    // recover: a third party may not consume the account's own recovery budget.
    expect(await resetRequest("198.51.100.42")).toBe(202);

    const db = readEnterpriseDbFile(dir);
    expect(db.emailDeliveries.filter((row) => row.kind === "auth.password_reset")).toHaveLength(6);
  });

  it("suppresses reset mail past the subject budget without failing the request or invalidating the live link", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-subject-budget-");
    configureEmailWebhook();
    process.env.SENA_PASSWORD_RESET_SUBJECT_RATE_LIMIT_MAX_REQUESTS = "2";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Reset Flood",
      email: "reset-flood@example.edu",
      password: "sena-secure-123",
      organization: "Backstop Lab"
    });
    stubAcceptingEmailWebhook();

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    await createEnterprisePasswordResetAsync({ email: "reset-flood@example.edu" });
    const second = await createEnterprisePasswordResetAsync({ email: "reset-flood@example.edu" });
    const liveTokenHash = readEnterpriseDbFile(dir).passwordResetRequests.map((row) => row.tokenHash);
    const third = await createEnterprisePasswordResetAsync({ email: "reset-flood@example.edu" });

    expect(third.status).toBe("queued");
    expect(third.delivery).toEqual(second.delivery);

    const db = readEnterpriseDbFile(dir);
    expect(db.emailDeliveries.filter((row) => row.kind === "auth.password_reset")).toHaveLength(2);
    // The suppressed request must not rotate the token that is already sitting
    // in the holder's inbox, or the backstop would itself break recovery.
    expect(db.passwordResetRequests.map((row) => row.tokenHash)).toEqual(liveTokenHash);
  });

  it("does not spend the subject budget on addresses that have no account to mail", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-subject-unknown-");
    configureEmailWebhook();
    process.env.SENA_PASSWORD_RESET_SUBJECT_RATE_LIMIT_MAX_REQUESTS = "2";
    vi.resetModules();
    stubAcceptingEmailWebhook();

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const results = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      results.push(await createEnterprisePasswordResetAsync({ email: "no-such-account@example.edu" }));
    }

    expect(results.map((result) => result.status)).toEqual(["queued", "queued", "queued", "queued"]);
    const db = readEnterpriseDbFile(dir);
    expect(db.apiRateLimits.filter((row) => row.bucket === "auth.password_reset.subject")).toHaveLength(0);
    expect(db.auditLog.filter((entry) => entry.event === "security.rate_limit")).toHaveLength(0);
  });
});

describe("SENA MFA challenge throttling (A3)", () => {
  it("invalidates an MFA challenge once its attempt budget is spent", async () => {
    enterpriseTempDbDir("sena-auth-mfa-challenge-attempts-");
    process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES = "50";
    vi.resetModules();

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "MFA Attempt User",
      email: "mfa-attempt-user@example.edu",
      password: "sena-secure-123",
      organization: "MFA Attempt Lab"
    });
    const setup = enterprise.createEnterpriseMfaSetup(registered.context);
    enterprise.enableEnterpriseMfa(registered.context, {
      setupToken: setup.setupToken,
      code: totpCode(setup.secret)
    });

    const challenge = enterprise.loginEnterpriseUser({
      email: "mfa-attempt-user@example.edu",
      password: "sena-secure-123"
    });
    if (!("mfaRequired" in challenge)) throw new Error("MFA challenge was not returned.");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => enterprise.loginEnterpriseUser({
        email: "mfa-attempt-user@example.edu",
        password: "sena-secure-123",
        mfaChallengeToken: challenge.challengeToken,
        mfaCode: wrongTotpCode(setup.secret)
      })).toThrow(/Authenticator code/i);
    }

    expect(() => enterprise.loginEnterpriseUser({
      email: "mfa-attempt-user@example.edu",
      password: "sena-secure-123",
      mfaChallengeToken: challenge.challengeToken,
      mfaCode: totpCode(setup.secret)
    })).toThrow(/Authenticator code/i);
  });

  it("locks the account after repeated failed MFA verifications", async () => {
    enterpriseTempDbDir("sena-auth-mfa-lockout-");
    vi.resetModules();

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "MFA Lockout User",
      email: "mfa-lockout-user@example.edu",
      password: "sena-secure-123",
      organization: "MFA Lockout Lab"
    });
    const setup = enterprise.createEnterpriseMfaSetup(registered.context);
    enterprise.enableEnterpriseMfa(registered.context, {
      setupToken: setup.setupToken,
      code: totpCode(setup.secret)
    });

    const challenge = enterprise.loginEnterpriseUser({
      email: "mfa-lockout-user@example.edu",
      password: "sena-secure-123"
    });
    if (!("mfaRequired" in challenge)) throw new Error("MFA challenge was not returned.");

    const failures: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        enterprise.loginEnterpriseUser({
          email: "mfa-lockout-user@example.edu",
          password: "sena-secure-123",
          mfaChallengeToken: challenge.challengeToken,
          mfaCode: wrongTotpCode(setup.secret)
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    expect(failures).toHaveLength(5);
    expect(() => enterprise.loginEnterpriseUser({
      email: "mfa-lockout-user@example.edu",
      password: "sena-secure-123"
    })).toThrow(/Too many failed login attempts/i);
  });
});

describe("SENA password-reset token exposure interlock (A4)", () => {
  it("refuses to expose a reset token in production runtimes on the pilot flag alone", async () => {
    enterpriseTempDbDir("sena-password-reset-exposure-production-");
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Exposure Production User",
      email: "exposure-production@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    const result = createEnterprisePasswordReset({ email: "exposure-production@example.edu" });

    expect(result.delivery.resetToken).toBeUndefined();
    expect(result.delivery.resetUrl).toBeUndefined();
    expect(result.delivery.mode).not.toBe("local-token");
    expect(result.delivery).not.toHaveProperty("tokenExposure");

    const { passwordResetTokenExposurePolicy } = await import("../enterprise/auth-config");
    expect(passwordResetTokenExposurePolicy()).toEqual(expect.objectContaining({
      enabled: false,
      requested: true,
      productionRuntime: true,
      explicitOverride: false,
      env: "SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE"
    }));
  });

  it("exposes a reset token in production only when the second explicit override is set", async () => {
    enterpriseTempDbDir("sena-password-reset-exposure-override-");
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    process.env.SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE = "1";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Exposure Override User",
      email: "exposure-override@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    const result = createEnterprisePasswordReset({ email: "exposure-override@example.edu" });

    expect(result.delivery.mode).toBe("local-token");
    expect(result.delivery.resetToken).toEqual(expect.any(String));
    expect(result.delivery).not.toHaveProperty("tokenExposure");

    const { passwordResetTokenExposurePolicy } = await import("../enterprise/auth-config");
    expect(passwordResetTokenExposurePolicy()).toEqual(expect.objectContaining({
      enabled: true,
      productionRuntime: true,
      explicitOverride: true
    }));
  });

  it("keeps the pilot escape hatch working outside production runtimes", async () => {
    enterpriseTempDbDir("sena-password-reset-exposure-pilot-");
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Exposure Pilot User",
      email: "exposure-pilot@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    const result = createEnterprisePasswordReset({ email: "exposure-pilot@example.edu" });

    expect(result.delivery.mode).toBe("local-token");
    expect(result.delivery.resetToken).toEqual(expect.any(String));
    expect(result.delivery).not.toHaveProperty("tokenExposure");

    const { passwordResetTokenExposurePolicy } = await import("../enterprise/auth-config");
    expect(passwordResetTokenExposurePolicy()).toEqual(expect.objectContaining({
      enabled: true,
      productionRuntime: false,
      explicitOverride: false
    }));
  });
});

describe("SENA password-reset production-posture interlock (GAP-1)", () => {
  it("treats a SENA-classified production deployment as production with NODE_ENV unset", async () => {
    // A plain `node server.js` / docker-compose host never sets NODE_ENV, so the
    // NODE_ENV-only test failed open on exactly the deployments SENA classifies
    // as production.
    vi.stubEnv("NODE_ENV", undefined);
    process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED = "1";
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.resetModules();

    const { passwordResetTokenExposure, passwordResetTokenExposurePolicy } = await import("../enterprise/auth-config");

    expect(process.env.NODE_ENV).toBeUndefined();
    expect(passwordResetTokenExposurePolicy()).toEqual(expect.objectContaining({
      requested: true,
      enabled: false,
      productionRuntime: true,
      explicitOverride: false
    }));
    expect(passwordResetTokenExposure()).toBe(false);
  });

  it("fires the interlock for each SENA production-posture flag on its own", async () => {
    const flags = [
      "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
      "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
      "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
    ];
    for (const flag of flags) {
      vi.stubEnv("NODE_ENV", undefined);
      vi.stubEnv("SENA_PASSWORD_RESET_EXPOSE_TOKEN", "1");
      vi.stubEnv(flag, "1");
      vi.resetModules();

      const { passwordResetTokenExposurePolicy } = await import("../enterprise/auth-config");
      expect(passwordResetTokenExposurePolicy(), flag).toEqual(expect.objectContaining({
        requested: true,
        enabled: false,
        productionRuntime: true
      }));
      vi.unstubAllEnvs();
    }
  });

  it("withholds the live reset token end to end on a SENA production posture", async () => {
    enterpriseTempDbDir("sena-password-reset-posture-interlock-");
    // NODE_ENV stays non-production; the SENA posture flag alone must gate.
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Posture Interlock User",
      email: "posture-interlock@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    const result = createEnterprisePasswordReset({ email: "posture-interlock@example.edu" });

    expect(result.delivery.resetToken).toBeUndefined();
    expect(result.delivery.resetUrl).toBeUndefined();
    expect(result.delivery.mode).not.toBe("local-token");
  });

  it("still honours the explicit second override under a SENA production posture", async () => {
    enterpriseTempDbDir("sena-password-reset-posture-override-");
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    process.env.SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE = "1";
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Posture Override User",
      email: "posture-override@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    const result = createEnterprisePasswordReset({ email: "posture-override@example.edu" });

    expect(result.delivery.mode).toBe("local-token");
    expect(result.delivery.resetToken).toEqual(expect.any(String));
  });
});

describe("SENA password-reset policy disclosure (GAP-3)", () => {
  it("keeps the token-exposure policy out of the anonymous response and in the audit trail", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-policy-disclosure-");
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/enterprise/auth-password-reset", async () => await import("../enterprise/auth-password-reset"));

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Policy Disclosure User",
      email: "policy-disclosure@example.edu",
      password: "sena-secure-123",
      organization: "Exposure Lab"
    });

    const route = await import("../../../app/api/auth/password-reset/route");
    const response = await route.POST(new Request("https://sena.example.test/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: passwordResetRequestBody("policy-disclosure@example.edu")
    }));
    const payload = await response.json() as { delivery: Record<string, unknown> };

    expect(response.status).toBe(202);
    expect(JSON.stringify(payload)).not.toContain("SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE");
    expect(payload.delivery).not.toHaveProperty("tokenExposure");
    expect(payload.delivery).not.toHaveProperty("productionRuntime");
    expect(payload.delivery).not.toHaveProperty("explicitOverride");

    const requestAudit = readEnterpriseDbFile(dir).auditLog.find((entry) => entry.event === "auth.password_reset.request");
    expect(requestAudit?.detail).toEqual(expect.objectContaining({
      tokenExposureRequested: true,
      tokenExposureEnabled: true,
      tokenExposureProductionRuntime: false,
      tokenExposureExplicitOverride: false,
      tokenExposureOverrideEnv: "SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE"
    }));
  });
});

describe("SENA reset page delivery honesty (A9)", () => {
  it("branches the request confirmation on the API delivery mode", () => {
    const pageSource = readProjectFile("app/reset-password/page.tsx");

    expect(pageSource).toContain("payload.delivery?.mode");
    expect(pageSource).toContain("email-provider-required");
    expect(pageSource).toContain("Email delivery is not configured on this deployment");
    expect(pageSource).toContain("email-webhook");
  });
});

describe("SENA registration self-declared profile fields (A11)", () => {
  it("records the self-declared role and product-updates opt-in without touching membership role", async () => {
    enterpriseTempDbDir("sena-auth-register-self-declared-");
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    const route = await import("../../../app/api/auth/register/route");
    const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Self Declared User",
        email: "self-declared-user@example.edu",
        password: "sena-secure-123",
        organization: "Self Declared Lab",
        role: "Lab Admin",
        productUpdates: true
      })
    }));
    const body = await response.json() as { memberships?: Array<{ role?: string }> };

    expect(response.status).toBe(201);
    expect(body.memberships?.[0]?.role).toBe("owner");

    const { readEnterpriseDb } = await import("../enterprise/state");
    const registerAudit = readEnterpriseDb().auditLog.find((entry) => entry.event === "auth.register");
    expect(registerAudit?.detail.role).toBe("owner");
    expect(registerAudit?.detail.selfDeclaredRole).toBe("Lab Admin");
    expect(registerAudit?.detail.productUpdatesOptIn).toBe(true);
  });

  it("binds the register product-updates checkbox to posted state", () => {
    const pageSource = readProjectFile("app/register/page.tsx");

    expect(pageSource).toMatch(/const \[productUpdates, setProductUpdates\] = useState/);
    expect(pageSource).toContain("checked={productUpdates}");
    expect(pageSource).toContain("productUpdates,");
    expect(pageSource).not.toMatch(/<input type="checkbox" className="mt-1 h-4 w-4" \/>/);
  });
});
