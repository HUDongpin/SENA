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

function enterpriseTempDbDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  enterpriseDbDirs.push(dir);
  process.env.SENA_ENTERPRISE_DB_DIR = dir;
  return dir;
}

afterEach(() => {
  // doMock registrations outlive resetModules, and their cached factory result
  // keeps the enterprise state module pinned to a previous test's temp db dir.
  vi.doUnmock("@/lib/sena/enterprise");
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.unstubAllEnvs();
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_APP_URL;
  delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
  delete process.env.SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE;
  delete process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES;
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

  it("backstops password-reset requests per email even when the source IP rotates", async () => {
    enterpriseTempDbDir("sena-auth-password-reset-subject-");
    vi.resetModules();

    const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
    registerEnterpriseUser({
      name: "Reset Backstop",
      email: "reset-backstop@example.edu",
      password: "sena-secure-123",
      organization: "Backstop Lab"
    });

    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      createEnterprisePasswordReset({ email: "reset-backstop@example.edu" });
    }

    expect(() => createEnterprisePasswordReset({ email: "reset-backstop@example.edu" }))
      .toThrow(/Too many requests/i);
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
    expect(result.delivery.tokenExposure).toEqual(expect.objectContaining({
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
    expect(result.delivery.tokenExposure).toEqual(expect.objectContaining({
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
    expect(result.delivery.tokenExposure).toEqual(expect.objectContaining({
      enabled: true,
      productionRuntime: false,
      explicitOverride: false
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
