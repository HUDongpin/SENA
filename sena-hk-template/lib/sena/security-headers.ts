import { enterprisePostgresConnectionStringFromEnv } from "./enterprise/postgres-url-env";

export const SENA_SECURITY_HEADER_MANIFEST = {
  cspDirectives: [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "upgrade-insecure-requests"
  ],
  staticHeaders: {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "x-sena-runtime": "enterprise-local"
  }
} as const;

function envValue(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

export function resolveSenaRuntimeHeader(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const adapter = envValue(env, "SENA_ENTERPRISE_DB_ADAPTER")?.toLowerCase();
  const stateStore = envValue(env, "SENA_ENTERPRISE_STATE_STORE")?.toLowerCase();
  const hasPostgresUrl = Boolean(enterprisePostgresConnectionStringFromEnv(env));
  if (stateStore !== "postgres" || !hasPostgresUrl) return "enterprise-local";
  if (adapter === "neon") return "enterprise-neon";
  if (adapter === "postgres") return "enterprise-postgres";
  return "enterprise-local";
}

export function buildSenaSecurityHeaders(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Record<string, string> {
  return {
    ...SENA_SECURITY_HEADER_MANIFEST.staticHeaders,
    "x-sena-runtime": resolveSenaRuntimeHeader(env),
    "content-security-policy-report-only": SENA_SECURITY_HEADER_MANIFEST.cspDirectives.join("; ")
  };
}
