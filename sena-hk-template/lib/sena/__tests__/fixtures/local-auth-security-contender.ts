import fs from "node:fs";
import path from "node:path";

const [mode, contenderId, coordinationDir, contextPath] = process.argv.slice(2);
if (!(["login", "rate-limit", "csrf", "mfa"] as string[]).includes(mode) || !contenderId || !coordinationDir) {
  throw new Error("Auth security contender requires mode, contender id, and coordination directory.");
}

fs.writeFileSync(path.join(coordinationDir, `ready-${contenderId}`), "ready");

let result: Record<string, unknown>;
try {
  if (mode === "login") {
    const { loginEnterpriseUser } = await import("../../enterprise/auth-login");
    loginEnterpriseUser({
      email: "concurrent-lockout@example.edu",
      password: "definitely-wrong"
    });
  } else if (mode === "rate-limit") {
    const { enforceEnterpriseApiRateLimit } = await import("../../enterprise/auth-security");
    enforceEnterpriseApiRateLimit({
      bucket: "auth.concurrent",
      key: "shared-client",
      limit: 4,
      windowSeconds: 600
    });
  } else {
    if (!contextPath) throw new Error("CSRF/MFA contender requires a serialized session context.");
    const context = JSON.parse(fs.readFileSync(contextPath, "utf8"));
    if (mode === "csrf") {
      const { verifyEnterpriseCsrfToken } = await import("../../enterprise/auth-session");
      verifyEnterpriseCsrfToken(context, "invalid-csrf-token");
    } else {
      const { disableEnterpriseMfa } = await import("../../enterprise/auth-mfa");
      disableEnterpriseMfa(context, { code: "not-a-totp-code" });
    }
  }
  result = { contenderId, status: "accepted" };
} catch (error) {
  result = {
    contenderId,
    status: "rejected",
    code: error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined,
    httpStatus: error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined
  };
}

process.stdout.write(`SECURITY_MUTATION_RESULT:${JSON.stringify(result)}\n`);
