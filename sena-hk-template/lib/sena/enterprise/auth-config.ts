import { createHash } from "node:crypto";
import { SenaEnterpriseError } from "./errors";

export function now() {
  return new Date().toISOString();
}
export function sha256Text(value: string | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : undefined;
}

export function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}
export function productionSecretStrength(value: string | undefined, minLength = 32): "configured" | "weak" | "missing" {
  if (!value) return "missing";
  const lower = value.toLowerCase();
  const hasPlaceholderTerm = /(^|[^a-z0-9])(test|dummy|example|placeholder|changeme|change-me|local|dev)([^a-z0-9]|$)/.test(lower);
  return value.length >= minLength && !hasPlaceholderTerm ? "configured" : "weak";
}

export function provisioningTokenProductionEvidence() {
  const token = envValue("SENA_PROVISIONING_TOKEN");
  const strength = productionSecretStrength(token);
  return {
    present: Boolean(token),
    ready: strength === "configured",
    strength,
    evidence: [
      `provisioningToken=${token ? "configured" : "missing"}`,
      `provisioningTokenStrength=${strength}`,
      "provisioningTokenMinLength=32"
    ]
  };
}


export function parseIpv4Octets(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : undefined;
}

export function isLocalOrPrivateIdentityEvidenceHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4Octets(host);
  if (ipv4) {
    const [first, second] = ipv4;
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  return host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:");
}

export function isReservedIdentityEvidenceHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "test" ||
    host.endsWith(".test") ||
    host === "example" ||
    host.endsWith(".example") ||
    host === "invalid" ||
    host.endsWith(".invalid") ||
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host === "example.net" ||
    host.endsWith(".example.net") ||
    host === "example.org" ||
    host.endsWith(".example.org");
}

export function configuredSenaAppOrigin(input: { required?: boolean } = {}) {
  const configured = envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL");
  if (!configured) {
    if (input.required) {
      throw new SenaEnterpriseError(
        "SENA application origin must be configured with SENA_APP_URL or NEXT_PUBLIC_SENA_APP_URL before identity production evidence can be accepted.",
        500,
        "missing_sena_app_origin"
      );
    }
    return undefined;
  }
  try {
    return new URL(configured).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL before identity production evidence can be accepted.", 500, "invalid_sso_app_url");
  }
}

export function passwordResetTokenExposure() {
  return envValue("SENA_PASSWORD_RESET_EXPOSE_TOKEN") === "1";
}

export function csrfKeySource(): "env-configured" | "session-secret" | "local-default-review" {
  if (envValue("SENA_CSRF_SECRET")) return "env-configured";
  if (envValue("SENA_SESSION_SECRET")) return "session-secret";
  return "local-default-review";
}

export function mfaKeySource(): "env-configured" | "local-default-review" {
  return envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET")
    ? "env-configured"
    : "local-default-review";
}
