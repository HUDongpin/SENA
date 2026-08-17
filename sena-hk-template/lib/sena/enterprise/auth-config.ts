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

export function envValueFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

export function envValue(key: string) {
  return envValueFrom(process.env, key);
}

export function booleanEnvFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = envValueFrom(env, key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function booleanEnv(key: string) {
  return booleanEnvFrom(process.env, key);
}

// The three flags a SENA operator sets to declare a deployment production, next
// to NODE_ENV.
//
// `enterpriseObservabilityProductionSampleStoreRequired` (ops-observability.ts),
// its live-probe sibling, and `enterpriseObjectStorageLiveProbeRequired`
// (object-storage-adapter.ts) all call senaProductionPosture() directly, each
// OR-ing its own opt-in flag on top.
//
// `enterpriseFileStateWritePolicy` (state.ts) deliberately does NOT, and an
// earlier version of this comment wrongly said it did. It requires NODE_ENV=
// production **AND** SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH together — its
// blocking reason is the compound label "NODE_ENV=production+SENA_REQUIRE_
// PRODUCTION_PERFORMANCE_PATH", and a test asserts that exact string. The other
// two flags do block it on their own. Do not "align" it with this predicate:
// that would silently change when file-backed writes are refused, which is a
// behaviour change wearing a refactor's clothes.
//
// The six further re-derivations this comment used to list are gone: the three
// process.env ones (cdn-verification, server-job-queue, server-job-worker-
// contract) call senaProductionPosture(), and the three env-injecting ones
// (enterprise-postgres, performance-budget-artifact, conference-load-rehearsal)
// call senaProductionPostureFrom(env). Every production hard-gate now answers
// one of the two, so the agreement suite can hold them all.
export const SENA_PRODUCTION_POSTURE_ENV_KEYS = [
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
] as const;

// Gating a security interlock on NODE_ENV alone fails open: a `node server.js`
// or docker-compose host never sets NODE_ENV, so a deployment SENA itself
// classifies as production reads as development. Every hard-gate must answer
// this predicate, not re-derive its own.
//
// NODE_ENV is read through envValueFrom, so it is trimmed like every other input
// here: NODE_ENV=" production" classifies as production. conference-load-
// rehearsal.ts already trimmed it and the other sites did not; trimming is the
// semantics that won, because it is the only direction that cannot fail open.
// Whitespace is invisible in a compose file or a CI variable, and reading
// " production" as development would disengage every interlock on a host the
// operator declared production — the f5d94fa shape. Widening only ever engages
// more gates, so no caller can regress from this.
//
// Case is deliberately left alone ("Production" is not production): Node and
// Next honour exact lowercase `production` only, and a wrong-case value is a
// visible mistake rather than an invisible one.
export function senaProductionPostureReasonsFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return [
    envValueFrom(env, "NODE_ENV") === "production" ? "NODE_ENV=production" : null,
    ...SENA_PRODUCTION_POSTURE_ENV_KEYS.map((key) => (booleanEnvFrom(env, key) ? key : null))
  ].filter((reason): reason is string => Boolean(reason));
}

export function senaProductionPostureReasons() {
  return senaProductionPostureReasonsFrom(process.env);
}

// The env-injecting variant, for hard-gates that take their environment as a
// parameter. Both forms delegate to one body so the two cannot drift apart —
// that drift is the whole defect class this predicate exists to close.
export function senaProductionPostureFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return senaProductionPostureReasonsFrom(env).length > 0;
}

export function senaProductionPosture() {
  return senaProductionPostureFrom(process.env);
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

// This object names the override variable and reports whether the deployment is
// currently handing out live reset tokens, so it is operator evidence, never
// part of an anonymous API response. Surface it through the audit trail
// (passwordResetTokenExposureAuditDetail) and the ops/readiness evidence.
export function passwordResetTokenExposurePolicy() {
  const requested = envValue("SENA_PASSWORD_RESET_EXPOSE_TOKEN") === "1";
  const explicitOverride = envValue("SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE") === "1";
  const postureReasons = senaProductionPostureReasons();
  const productionRuntime = postureReasons.length > 0;
  return {
    requested,
    enabled: requested && (!productionRuntime || explicitOverride),
    productionRuntime,
    postureReasons,
    explicitOverride,
    env: "SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE" as const
  };
}

export function passwordResetTokenExposure() {
  return passwordResetTokenExposurePolicy().enabled;
}

// Operator-facing custody of the interlock. Ops/readiness already gates on
// passwordResetTokenExposure() (ops-deployment-readiness.ts, ops-governance.ts,
// ops-deployment-decisions.ts); this is the per-request record of the same
// policy, and it is where the override variable is named — never in a response.
export function passwordResetTokenExposureAuditDetail() {
  const policy = passwordResetTokenExposurePolicy();
  return {
    tokenExposureRequested: policy.requested,
    tokenExposureEnabled: policy.enabled,
    tokenExposureProductionRuntime: policy.productionRuntime,
    tokenExposureProductionPosture: policy.postureReasons.join("|") || "none",
    tokenExposureExplicitOverride: policy.explicitOverride,
    tokenExposureOverrideEnv: policy.env
  };
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
