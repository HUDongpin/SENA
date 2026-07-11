import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import type { JsonWebKey as CryptoJsonWebKey } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseTeam
} from "./state";
import type { SenaEnterpriseGovernanceCheck } from "./ops-governance";
import {
  appendAudit,
  type SenaEnterpriseAuditLogEntry
} from "./ops-audit";
import {
  normalizeEmail,
  tokenHash
} from "./auth-password";
import {
  requirePendingInvitationForEmail,
  safeInviteCode
} from "./auth-invitations";
import {
  contextFromDb,
  createSession
} from "./auth-session";
import {
  configuredSenaAppOrigin,
  envValue,
  isLocalOrPrivateIdentityEvidenceHost,
  isReservedIdentityEvidenceHost,
  now,
  productionSecretStrength,
  sha256Text
} from "./auth-config";

export const ssoCallbackPath = "/api/auth/sso/callback";
export const ssoProviders: SenaEnterpriseSsoProvider[] = ["institution", "google", "orcid"];

const ssoStateMinutes = 10;

const defaultSsoDiscoveryUrls: Partial<Record<SenaEnterpriseSsoProvider, string>> = {
  google: "https://accounts.google.com/.well-known/openid-configuration",
  orcid: "https://orcid.org/.well-known/openid-configuration"
};

type SenaEnterpriseResolvedSsoProvider = {
  provider: SenaEnterpriseSsoProvider;
  clientId: string;
  clientSecret: string;
  scopes: string;
  callbackUrl: string;
  discoveryUrl?: string;
  issuer?: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  jwksUrl?: string;
};

export type SenaEnterpriseSsoProvider = "institution" | "google" | "orcid";

export type SenaEnterpriseSsoState = {
  id: string;
  provider: SenaEnterpriseSsoProvider;
  stateHash: string;
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
  inviteCode?: string;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterpriseSsoProviderStatus = {
  provider: SenaEnterpriseSsoProvider;
  configured: boolean;
  clientId?: string;
  scopes?: string;
  clientSecretStrength: "configured" | "weak" | "missing";
  endpointHostPolicy: "production" | "not-required" | "missing" | "invalid" | "non-https" | "local-or-private" | "sena-application-origin" | "reserved-example-or-test";
  mode: "oauth-oidc" | "local-pilot-fallback";
  fallbackPolicy: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy;
    enabled: boolean;
    productionRuntime: boolean;
    explicitOverride: boolean;
    env: "SENA_ALLOW_LOCAL_SSO_FALLBACK";
  };
  requiredEnv: string[];
  missingEnv: string[];
  discoveryUrl?: string;
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUrl?: string;
};

export type SenaEnterpriseSsoProviderPreflight = {
  provider: SenaEnterpriseSsoProvider;
  status: "pass" | "review";
  mode: "oauth-oidc" | "local-pilot-fallback";
  configured: boolean;
  generatedAt: string;
  callbackUrl?: string;
  endpointHashes: {
    discovery?: string;
    issuer?: string;
    authorization?: string;
    token?: string;
    userinfo?: string;
    jwks?: string;
    callback?: string;
  };
  checks: SenaEnterpriseGovernanceCheck[];
  errorCode?: string;
  errorHash?: string;
};

export type SenaEnterpriseSsoProviderPreflightResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight;
  generatedAt: string;
  baseUrl: string;
  summary: {
    checked: number;
    passed: number;
    review: number;
    configuredProviders: number;
  };
  providers: SenaEnterpriseSsoProviderPreflight[];
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function normalizedSsoBaseUrl(baseUrl?: string) {
  const candidate = (baseUrl || envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
  try {
    return new URL(candidate).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL for OAuth/OIDC SSO.", 500, "invalid_sso_app_url");
  }
}

function ssoCallbackUrl(provider: SenaEnterpriseSsoProvider, baseUrl?: string) {
  const url = new URL(ssoCallbackPath, normalizedSsoBaseUrl(baseUrl));
  url.searchParams.set("provider", provider);
  return url.toString();
}

function safeRedirectTo(redirectTo?: string) {
  const fallback = "/workspace/sena";
  const value = redirectTo?.trim();
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function ssoStateExpiry() {
  return new Date(Date.now() + ssoStateMinutes * 60 * 1000).toISOString();
}

export function providerEnvPrefix(provider: SenaEnterpriseSsoProvider) {
  return `SENA_SSO_${provider.toUpperCase()}`;
}

function institutionSsoEndpointHostPolicy(urls: Array<string | undefined>): SenaEnterpriseSsoProviderStatus["endpointHostPolicy"] {
  const configuredUrls = urls.filter((url): url is string => Boolean(url));
  if (configuredUrls.length === 0) return "missing";
  const appOrigin = configuredSenaAppOrigin();
  for (const value of configuredUrls) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return "invalid";
    }
    if (url.protocol !== "https:") return "non-https";
    if (appOrigin && url.origin === appOrigin) return "sena-application-origin";
    if (isLocalOrPrivateIdentityEvidenceHost(url.hostname)) return "local-or-private";
    if (isReservedIdentityEvidenceHost(url.hostname)) return "reserved-example-or-test";
  }
  return "production";
}

function ssoEndpointHostPolicy(
  provider: SenaEnterpriseSsoProvider,
  urls: Array<string | undefined>
): SenaEnterpriseSsoProviderStatus["endpointHostPolicy"] {
  return provider === "institution" ? institutionSsoEndpointHostPolicy(urls) : "not-required";
}

function profileString(profile: Record<string, unknown>, key: string) {
  const value = profile[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodeSsoJwtJsonSegment(provider: SenaEnterpriseSsoProvider, segment: string, code: string) {
  try {
    const decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("segment is not an object");
    return decoded as Record<string, unknown>;
  } catch {
    throw new SenaEnterpriseError(`${provider} id_token could not be parsed.`, 502, code);
  }
}

function decodeSsoJwt(provider: SenaEnterpriseSsoProvider, idToken: string) {
  const segments = idToken.split(".");
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    throw new SenaEnterpriseError(`${provider} id_token is not a signed JWT.`, 502, "sso_id_token_invalid");
  }
  return {
    header: decodeSsoJwtJsonSegment(provider, segments[0], "sso_id_token_header_invalid"),
    payload: decodeSsoJwtJsonSegment(provider, segments[1], "sso_id_token_invalid"),
    signingInput: `${segments[0]}.${segments[1]}`,
    signature: Buffer.from(segments[2], "base64url")
  };
}

function ssoIdTokenAudienceMatches(payload: Record<string, unknown>, clientId: string) {
  const audience = payload.aud;
  if (typeof audience === "string") return audience === clientId;
  if (Array.isArray(audience)) return audience.some((candidate) => candidate === clientId);
  return false;
}

const ssoJwtSignatureAlgorithms: Record<string, string> = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512",
  ES256: "SHA256",
  ES384: "SHA384",
  ES512: "SHA512"
};

function numericSsoClaim(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function loadSsoJwks(provider: SenaEnterpriseSsoProvider, jwksUrl: string | undefined) {
  if (!jwksUrl) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata is required for id_token validation.`, 500, "sso_id_token_metadata_missing");
  }
  const response = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata could not be loaded.`, 502, "sso_jwks_fetch_failed");
  }
  const body = await response.json() as Record<string, unknown>;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) {
    throw new SenaEnterpriseError(`${provider} JWKS metadata did not include signing keys.`, 502, "sso_jwks_keys_missing");
  }
  return keys.filter((key): key is Record<string, unknown> => Boolean(key) && typeof key === "object" && !Array.isArray(key));
}

function matchingSsoJwk(jwks: Record<string, unknown>[], header: Record<string, unknown>) {
  const kid = profileString(header, "kid");
  const alg = profileString(header, "alg");
  return jwks.find((key) => {
    const keyUse = profileString(key, "use");
    const keyKid = profileString(key, "kid");
    const keyAlg = profileString(key, "alg");
    return (!kid || keyKid === kid) &&
      (!keyAlg || keyAlg === alg) &&
      (!keyUse || keyUse === "sig");
  });
}

async function verifySsoIdTokenSignature(input: {
  provider: SenaEnterpriseSsoProvider;
  jwksUrl?: string;
  header: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}) {
  const alg = profileString(input.header, "alg");
  const algorithm = alg ? ssoJwtSignatureAlgorithms[alg] : undefined;
  if (!algorithm) {
    throw new SenaEnterpriseError(`${input.provider} id_token signing algorithm is not supported.`, 502, "sso_id_token_alg_unsupported");
  }
  const jwks = await loadSsoJwks(input.provider, input.jwksUrl);
  const jwk = matchingSsoJwk(jwks, input.header);
  if (!jwk) {
    throw new SenaEnterpriseError(`${input.provider} JWKS did not include the id_token signing key.`, 502, "sso_jwks_key_not_found");
  }
  let valid = false;
  try {
    const keyObject = createPublicKey({ key: jwk as CryptoJsonWebKey, format: "jwk" });
    valid = verify(algorithm, Buffer.from(input.signingInput), keyObject, input.signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new SenaEnterpriseError(`${input.provider} id_token signature is invalid.`, 401, "sso_id_token_signature_invalid");
  }
}

async function validateSsoIdTokenBinding(input: {
  provider: SenaEnterpriseSsoProvider;
  idToken: string;
  expectedNonce: string;
  clientId: string;
  expectedIssuer?: string;
  jwksUrl?: string;
}) {
  const token = decodeSsoJwt(input.provider, input.idToken);
  await verifySsoIdTokenSignature({
    provider: input.provider,
    jwksUrl: input.jwksUrl,
    header: token.header,
    signingInput: token.signingInput,
    signature: token.signature
  });
  const payload = token.payload;
  const issuer = profileString(payload, "iss");
  if (!input.expectedIssuer || !issuer || issuer !== input.expectedIssuer) {
    throw new SenaEnterpriseError(`${input.provider} id_token issuer did not match the configured issuer.`, 401, "sso_issuer_mismatch");
  }
  const nonce = profileString(payload, "nonce");
  if (!nonce) throw new SenaEnterpriseError(`${input.provider} id_token did not include a nonce.`, 502, "sso_nonce_missing");
  if (nonce !== input.expectedNonce) {
    throw new SenaEnterpriseError(`${input.provider} id_token nonce did not match the SSO state.`, 401, "sso_nonce_mismatch");
  }
  if (!ssoIdTokenAudienceMatches(payload, input.clientId)) {
    throw new SenaEnterpriseError(`${input.provider} id_token audience did not match the SENA client.`, 401, "sso_audience_mismatch");
  }
  const issuedAt = numericSsoClaim(payload, "iat");
  if (!issuedAt) {
    throw new SenaEnterpriseError(`${input.provider} id_token did not include an issued-at timestamp.`, 502, "sso_id_token_iat_missing");
  }
  const expiresAt = numericSsoClaim(payload, "exp");
  if (!expiresAt) {
    throw new SenaEnterpriseError(`${input.provider} id_token did not include an expiry timestamp.`, 502, "sso_id_token_exp_missing");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt <= nowSeconds) {
    throw new SenaEnterpriseError(`${input.provider} id_token has expired.`, 401, "sso_id_token_expired");
  }
  if (issuedAt > nowSeconds + 300) {
    throw new SenaEnterpriseError(`${input.provider} id_token issued-at timestamp is in the future.`, 401, "sso_id_token_iat_invalid");
  }
}

function subjectEmailFallback(provider: SenaEnterpriseSsoProvider, subject: string) {
  const local = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "user";
  return `${provider}-${local}@sso.sena.local`;
}

export function ssoProviderStatus(provider: SenaEnterpriseSsoProvider): SenaEnterpriseSsoProviderStatus {
  const prefix = providerEnvPrefix(provider);
  const clientIdKey = `${prefix}_CLIENT_ID`;
  const clientSecretKey = `${prefix}_CLIENT_SECRET`;
  const discoveryKey = `${prefix}_DISCOVERY_URL`;
  const issuerKey = `${prefix}_ISSUER`;
  const authorizationKey = `${prefix}_AUTHORIZATION_URL`;
  const tokenKey = `${prefix}_TOKEN_URL`;
  const userinfoKey = `${prefix}_USERINFO_URL`;
  const jwksKey = `${prefix}_JWKS_URL`;
  const clientId = envValue(clientIdKey);
  const clientSecret = envValue(clientSecretKey);
  const scopes = envValue(`${prefix}_SCOPES`) || "openid email profile";
  const clientSecretStrength = productionSecretStrength(clientSecret);
  const discoveryUrl = envValue(discoveryKey) || defaultSsoDiscoveryUrls[provider];
  const issuer = envValue(issuerKey);
  const authorizationUrl = envValue(authorizationKey);
  const tokenUrl = envValue(tokenKey);
  const userinfoUrl = envValue(userinfoKey);
  const jwksUrl = envValue(jwksKey);
  const endpointHostPolicy = ssoEndpointHostPolicy(provider, [
    discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  ]);
  const requiredEnv = [clientIdKey, clientSecretKey];
  const missingEnv = [
    clientId ? null : clientIdKey,
    clientSecret ? null : clientSecretKey,
    discoveryUrl || (authorizationUrl && tokenUrl && userinfoUrl) ? null : `${discoveryKey} or ${authorizationKey}+${tokenKey}+${userinfoKey}`
  ].filter(Boolean) as string[];

  return {
    provider,
    configured: missingEnv.length === 0,
    clientId,
    scopes,
    clientSecretStrength,
    endpointHostPolicy,
    mode: missingEnv.length === 0 ? "oauth-oidc" : "local-pilot-fallback",
    fallbackPolicy: enterpriseLocalSsoFallbackPolicy(),
    requiredEnv,
    missingEnv,
    discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  };
}

export function enterpriseLocalSsoFallbackPolicy() {
  const explicitOverride = envValue("SENA_ALLOW_LOCAL_SSO_FALLBACK") === "1";
  const productionRuntime = process.env.NODE_ENV === "production";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy,
    enabled: !productionRuntime || explicitOverride,
    productionRuntime,
    explicitOverride,
    env: "SENA_ALLOW_LOCAL_SSO_FALLBACK" as const
  };
}

export function requireEnterpriseLocalSsoFallbackAllowed(provider: SenaEnterpriseSsoProvider) {
  const policy = enterpriseLocalSsoFallbackPolicy();
  if (!policy.enabled) {
    throw new SenaEnterpriseError(
      `Local pilot SSO fallback is disabled for ${provider} in production. Configure OAuth/OIDC provider credentials or set SENA_ALLOW_LOCAL_SSO_FALLBACK=1 only for an approved pilot-only deployment.`,
      503,
      "sso_local_fallback_disabled"
    );
  }
  return policy;
}

export function getEnterpriseSsoProviderStatuses(): SenaEnterpriseSsoProviderStatus[] {
  return ssoProviders.map((provider) => ssoProviderStatus(provider));
}

export function isEnterpriseSsoProviderConfigured(provider: SenaEnterpriseSsoProvider) {
  return ssoProviderStatus(provider).configured;
}

function httpUrlCheck(id: string, label: string, url: string | undefined): SenaEnterpriseGovernanceCheck {
  let pass = false;
  if (url) {
    try {
      const parsed = new URL(url);
      pass = parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      pass = false;
    }
  }
  return {
    id,
    label,
    status: pass ? "pass" : "review",
    evidence: [
      `configured=${url ? "true" : "false"}`,
      `urlHash=${sha256Text(url) ?? "none"}`
    ],
    nextAction: pass ? "Keep this OAuth/OIDC endpoint pinned in the IdP configuration." : "Configure this OAuth/OIDC endpoint as an absolute HTTP(S) URL."
  };
}

export function latestSsoPreflightByProvider(db: SenaEnterpriseDb) {
  const latest = new Map<SenaEnterpriseSsoProvider, SenaEnterpriseAuditLogEntry>();
  for (const entry of db.auditLog
    .filter((candidate) => candidate.event === "auth.sso.preflight.pass" || candidate.event === "auth.sso.preflight.fail")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const provider = entry.detail.provider;
    if ((provider === "institution" || provider === "google" || provider === "orcid") && !latest.has(provider)) {
      latest.set(provider, entry);
    }
  }
  return latest;
}

const ssoPreflightFreshnessPolicy = {
  maxAgeDays: 30
};

function ssoPreflightAgeDays(entry: SenaEnterpriseAuditLogEntry) {
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs) || createdAtMs > Date.now()) return null;
  return Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000));
}

function auditDetailString(entry: SenaEnterpriseAuditLogEntry, key: string) {
  const value = entry.detail[key];
  return typeof value === "string" ? value : undefined;
}

export function ssoPreflightCurrentConfigHashes(provider: SenaEnterpriseSsoProviderStatus) {
  return {
    clientIdHash: sha256Text(provider.clientId),
    scopesHash: sha256Text(provider.scopes),
    endpointDiscoveryHash: sha256Text(provider.discoveryUrl),
    issuerHash: sha256Text(provider.issuer),
    endpointAuthorizationHash: sha256Text(provider.authorizationUrl),
    endpointTokenHash: sha256Text(provider.tokenUrl),
    endpointUserinfoHash: sha256Text(provider.userinfoUrl),
    endpointJwksHash: sha256Text(provider.jwksUrl),
    callbackHash: sha256Text(ssoCallbackUrl(provider.provider))
  };
}

export function configHashBindingChanged(
  previousHashes: Record<string, string | undefined>,
  currentHashes: Record<string, string | undefined>
) {
  const keys = new Set([...Object.keys(previousHashes), ...Object.keys(currentHashes)]);
  for (const key of keys) {
    if (previousHashes[key] !== currentHashes[key]) return true;
  }
  return false;
}

function ssoPreflightCurrentConfigBindingValues(provider: SenaEnterpriseSsoProviderStatus) {
  return {
    ...ssoPreflightCurrentConfigHashes(provider),
    clientSecretStrength: provider.clientSecretStrength,
    clientSecretMinLength: "32"
  };
}

export function ssoPreflightConfigBinding(entry: SenaEnterpriseAuditLogEntry | undefined, provider: SenaEnterpriseSsoProviderStatus | undefined) {
  if (!entry || !provider) return "missing";
  if (!provider.configured) return "missing-config";
  const current = ssoPreflightCurrentConfigBindingValues(provider);
  const previous = Object.fromEntries(Object.keys(current).map((key) => [key, auditDetailString(entry, key)]));
  return configHashBindingChanged(previous, current) ? "changed" : "current";
}

export function ssoPreflightStatus(entry: SenaEnterpriseAuditLogEntry | undefined, provider?: SenaEnterpriseSsoProviderStatus) {
  if (!entry) return "missing";
  if (entry.event !== "auth.sso.preflight.pass") return "fail";
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs)) return "invalid";
  if (createdAtMs > Date.now()) return "future";
  const maxAgeMs = ssoPreflightFreshnessPolicy.maxAgeDays * 24 * 60 * 60 * 1000;
  if (Date.now() - createdAtMs > maxAgeMs) return "stale";
  const configBinding = ssoPreflightConfigBinding(entry, provider);
  if (configBinding === "changed") return "stale-config";
  if (configBinding === "missing-config") return "missing-config";
  return "pass";
}

function ssoPreflightEntryFresh(entry: SenaEnterpriseAuditLogEntry | undefined, provider?: SenaEnterpriseSsoProviderStatus) {
  return ssoPreflightStatus(entry, provider) === "pass";
}

export function ssoPreflightEvidence(db: SenaEnterpriseDb, providers = getEnterpriseSsoProviderStatuses()) {
  const latest = latestSsoPreflightByProvider(db);
  return providers.map((provider) => {
    const entry = latest.get(provider.provider);
    const ageDays = entry ? ssoPreflightAgeDays(entry) : null;
    return `${provider.provider}:configured=${provider.configured};preflight=${ssoPreflightStatus(entry, provider)};at=${entry?.createdAt ?? "missing"};maxAgeDays=${ssoPreflightFreshnessPolicy.maxAgeDays};ageDays=${ageDays ?? "missing"};configBinding=${ssoPreflightConfigBinding(entry, provider)}`;
  });
}

export function ssoPreflightPassedProviders(db: SenaEnterpriseDb, providers = getEnterpriseSsoProviderStatuses()) {
  const latest = latestSsoPreflightByProvider(db);
  return providers.filter((provider) => ssoPreflightEntryFresh(latest.get(provider.provider), provider));
}

export type SenaEnterpriseSsoPreflightInput = {
  providers?: SenaEnterpriseSsoProvider[];
  baseUrl?: string;
};

export type SenaEnterpriseSsoAuthorizationInput = {
  provider: SenaEnterpriseSsoProvider;
  baseUrl?: string;
  redirectTo?: string;
  inviteCode?: string;
};

export type SenaEnterpriseSsoCallbackInput = {
  code: string;
  state: string;
  provider?: SenaEnterpriseSsoProvider;
  baseUrl?: string;
};

export type SenaEnterpriseSsoUserInput = {
  provider: SenaEnterpriseSsoProvider;
  email: string;
  name?: string;
  organization?: string;
  subject?: string;
  inviteCode?: string;
};

async function preflightEnterpriseSsoProvidersInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterpriseSsoPreflightInput = {}
): Promise<SenaEnterpriseSsoProviderPreflightResult> {
  const selectedProviders = input.providers?.length ? Array.from(new Set(input.providers)) : ssoProviders;
  const generatedAt = now();
  const baseUrl = normalizedSsoBaseUrl(input.baseUrl);
  const providers: SenaEnterpriseSsoProviderPreflight[] = [];

  for (const provider of selectedProviders) {
    const status = ssoProviderStatus(provider);
    const endpointHostPolicyPass = status.endpointHostPolicy === "production" || status.endpointHostPolicy === "not-required";
    const providerConfigPass = status.configured && status.clientSecretStrength === "configured" && endpointHostPolicyPass;
    const checks: SenaEnterpriseGovernanceCheck[] = [{
      id: "sso-provider-config",
      label: "OAuth/OIDC provider environment",
      status: providerConfigPass ? "pass" : "review",
      evidence: [
        `provider=${provider}`,
        `mode=${status.mode}`,
        `missing=${status.missingEnv.join("|") || "none"}`,
        `clientSecretStrength=${status.clientSecretStrength}`,
        `endpointHostPolicy=${status.endpointHostPolicy}`,
        "clientSecretMinLength=32"
      ],
      nextAction: providerConfigPass
        ? "Keep client credentials in the deployment secret store."
        : !endpointHostPolicyPass
          ? "Configure institution IdP endpoints with institution-owned HTTPS hosts, not local, SENA-owned, reserved, or example/test domains."
          : status.configured
            ? "Rotate the OAuth/OIDC client secret to a production secret-store value."
            : "Configure client ID, client secret, and discovery or explicit OAuth/OIDC endpoints."
    }];
    if (provider === "institution") {
      checks.push({
        id: "sso-production-endpoint-hosts",
        label: "Institution IdP production endpoint hosts",
        status: endpointHostPolicyPass ? "pass" : "review",
        evidence: [
          `provider=${provider}`,
          `endpointHostPolicy=${status.endpointHostPolicy}`,
          "requiredProtocol=https",
          "forbiddenHostKinds=local-or-private|sena-application-origin|reserved-example-or-test"
        ],
        nextAction: endpointHostPolicyPass
          ? "Keep institution IdP endpoints pinned to institution-owned HTTPS hosts."
          : "Move institution IdP issuer, authorization, token, userinfo, and JWKS endpoints to institution-owned HTTPS hosts before production release."
      });
    }
    let config: SenaEnterpriseResolvedSsoProvider | undefined;
    let errorCode: string | undefined;
    let errorHash: string | undefined;

    if (status.configured) {
      try {
        config = await resolveSsoProvider(provider, baseUrl);
        checks.push(httpUrlCheck("sso-authorization-url", "Authorization endpoint", config.authorizationUrl));
        checks.push(httpUrlCheck("sso-token-url", "Token endpoint", config.tokenUrl));
        checks.push(httpUrlCheck("sso-userinfo-url", "Userinfo endpoint", config.userinfoUrl));
        checks.push(httpUrlCheck("sso-jwks-url", "JWKS endpoint", config.jwksUrl));
        const callbackUrl = new URL(config.callbackUrl);
        checks.push({
          id: "sso-callback-url",
          label: "Callback URL",
          status: callbackUrl.searchParams.get("provider") === provider && callbackUrl.pathname === ssoCallbackPath ? "pass" : "review",
          evidence: [
            `callbackHash=${sha256Text(config.callbackUrl)}`,
            `providerParam=${callbackUrl.searchParams.get("provider") ?? "missing"}`,
            `path=${callbackUrl.pathname}`,
            `origin=${callbackUrl.origin}`
          ],
          nextAction: callbackUrl.searchParams.get("provider") === provider && callbackUrl.pathname === ssoCallbackPath
            ? "Register this callback URL with the IdP tenant."
            : "Fix SENA_APP_URL or callback routing before enabling this SSO provider."
        });
        const scopes = config.scopes.split(/\s+/).filter(Boolean);
        checks.push({
          id: "sso-scopes",
          label: "OIDC scopes",
          status: scopes.includes("openid") && scopes.includes("email") ? "pass" : "review",
          evidence: [`scopes=${scopes.join("|") || "none"}`],
          nextAction: scopes.includes("openid") && scopes.includes("email")
            ? "Keep openid/email/profile scopes aligned with the IdP consent screen."
            : "Include at least openid and email scopes for SENA SSO."
        });
        checks.push({
          id: "sso-pkce-nonce-binding",
          label: "PKCE and nonce binding",
          status: "pass",
          evidence: [
            "flow=authorization-code",
            "pkce=S256",
            "state=hashed-server-side",
            "nonce=state-bound",
            "idTokenNonce=validated-when-present",
            "audience=client-id"
          ],
          nextAction: "Keep PKCE S256, server-side state storage, and id_token nonce/audience validation enabled for this IdP."
        });
        const issuerUrl = config.issuer ? new URL(config.issuer) : undefined;
        const jwksUrl = config.jwksUrl ? new URL(config.jwksUrl) : undefined;
        const idTokenValidationPass = Boolean(
          issuerUrl &&
          jwksUrl &&
          (issuerUrl.protocol === "https:" || issuerUrl.protocol === "http:") &&
          (jwksUrl.protocol === "https:" || jwksUrl.protocol === "http:")
        );
        checks.push({
          id: "sso-id-token-validation",
          label: "OIDC id_token validation",
          status: idTokenValidationPass ? "pass" : "review",
          evidence: [
            `issuerHash=${sha256Text(config.issuer) ?? "missing"}`,
            `jwksHash=${sha256Text(config.jwksUrl) ?? "missing"}`,
            "signature=jwks",
            "claims=issuer|audience|nonce|exp|iat"
          ],
          nextAction: idTokenValidationPass
            ? "Keep issuer and JWKS metadata pinned through discovery or SENA_SSO_*_ISSUER/JWKS_URL."
            : "Configure issuer and JWKS metadata so SENA can verify OIDC id_token signatures and claims."
        });
      } catch (error) {
        const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
        errorCode = error instanceof SenaEnterpriseError ? error.code : "sso_preflight_failed";
        errorHash = createHash("sha256").update(message).digest("hex");
        checks.push({
          id: "sso-provider-resolution",
          label: "Provider metadata resolution",
          status: "review",
          evidence: [
            `errorCode=${errorCode}`,
            `errorHash=${errorHash}`
          ],
          nextAction: "Fix IdP discovery metadata or explicit endpoint configuration, then rerun SSO preflight."
        });
      }
    }

    const providerResult: SenaEnterpriseSsoProviderPreflight = {
      provider,
      status: checks.every((check) => check.status === "pass") ? "pass" : "review",
      mode: status.mode,
      configured: status.configured,
      generatedAt,
      callbackUrl: config?.callbackUrl,
      endpointHashes: {
        discovery: sha256Text(config?.discoveryUrl ?? status.discoveryUrl),
        issuer: sha256Text(config?.issuer ?? status.issuer),
        authorization: sha256Text(config?.authorizationUrl ?? status.authorizationUrl),
        token: sha256Text(config?.tokenUrl ?? status.tokenUrl),
        userinfo: sha256Text(config?.userinfoUrl ?? status.userinfoUrl),
        jwks: sha256Text(config?.jwksUrl ?? status.jwksUrl),
        callback: sha256Text(config?.callbackUrl)
      },
      checks,
      errorCode,
      errorHash
    };
    appendAudit(db, {
      event: providerResult.status === "pass" ? "auth.sso.preflight.pass" : "auth.sso.preflight.fail",
      detail: {
        provider,
        mode: providerResult.mode,
        configured: providerResult.configured,
        clientIdHash: sha256Text(config?.clientId ?? status.clientId) ?? null,
        scopesHash: sha256Text(config?.scopes ?? status.scopes) ?? null,
        clientSecretStrength: status.clientSecretStrength,
        clientSecretMinLength: "32",
        endpointDiscoveryHash: providerResult.endpointHashes.discovery ?? null,
        endpointAuthorizationHash: providerResult.endpointHashes.authorization ?? null,
        endpointTokenHash: providerResult.endpointHashes.token ?? null,
        endpointUserinfoHash: providerResult.endpointHashes.userinfo ?? null,
        endpointJwksHash: providerResult.endpointHashes.jwks ?? null,
        issuerHash: providerResult.endpointHashes.issuer ?? null,
        callbackHash: providerResult.endpointHashes.callback ?? null,
        errorCode: providerResult.errorCode ?? null,
        errorHash: providerResult.errorHash ?? null
      }
    });
    providers.push(providerResult);
  }

  const passed = providers.filter((provider) => provider.status === "pass").length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight,
    generatedAt,
    baseUrl,
    summary: {
      checked: providers.length,
      passed,
      review: providers.length - passed,
      configuredProviders: providers.filter((provider) => provider.configured).length
    },
    providers
  };
}

export async function preflightEnterpriseSsoProviders(input: SenaEnterpriseSsoPreflightInput = {}): Promise<SenaEnterpriseSsoProviderPreflightResult> {
  const db = readEnterpriseDb();
  const result = await preflightEnterpriseSsoProvidersInDb(db, input);
  saveDb(db);
  return result;
}

export async function preflightEnterpriseSsoProvidersAsync(input: SenaEnterpriseSsoPreflightInput = {}): Promise<SenaEnterpriseSsoProviderPreflightResult> {
  const state = await readEnterpriseState();
  const result = await preflightEnterpriseSsoProvidersInDb(state.db, input);
  await saveEnterpriseState(state, state.db);
  return result;
}

async function resolveSsoProvider(provider: SenaEnterpriseSsoProvider, baseUrl?: string): Promise<SenaEnterpriseResolvedSsoProvider> {
  const status = ssoProviderStatus(provider);
  if (!status.configured) {
    throw new SenaEnterpriseError(`${provider} OAuth/OIDC SSO is not configured.`, 503, "sso_provider_not_configured");
  }

  const prefix = providerEnvPrefix(provider);
  let issuer = status.issuer;
  let authorizationUrl = status.authorizationUrl;
  let tokenUrl = status.tokenUrl;
  let userinfoUrl = status.userinfoUrl;
  let jwksUrl = status.jwksUrl;

  if ((!issuer || !authorizationUrl || !tokenUrl || !userinfoUrl || !jwksUrl) && status.discoveryUrl) {
    const response = await fetch(status.discoveryUrl, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new SenaEnterpriseError(`Could not load ${provider} OIDC discovery metadata.`, 502, "sso_discovery_failed");
    }
    const metadata = await response.json() as Record<string, unknown>;
    issuer = issuer || profileString(metadata, "issuer");
    authorizationUrl = authorizationUrl || profileString(metadata, "authorization_endpoint");
    tokenUrl = tokenUrl || profileString(metadata, "token_endpoint");
    userinfoUrl = userinfoUrl || profileString(metadata, "userinfo_endpoint");
    jwksUrl = jwksUrl || profileString(metadata, "jwks_uri");
  }

  if (!authorizationUrl || !tokenUrl || !userinfoUrl) {
    throw new SenaEnterpriseError(`${provider} OAuth/OIDC endpoints are incomplete.`, 500, "sso_endpoints_incomplete");
  }

  return {
    provider,
    clientId: status.clientId!,
    clientSecret: envValue(`${prefix}_CLIENT_SECRET`)!,
    scopes: status.scopes ?? "openid email profile",
    callbackUrl: ssoCallbackUrl(provider, baseUrl),
    discoveryUrl: status.discoveryUrl,
    issuer,
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    jwksUrl
  };
}

async function createEnterpriseSsoAuthorizationInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterpriseSsoAuthorizationInput
) {
  const provider = input.provider;
  const config = await resolveSsoProvider(provider, input.baseUrl);
  const rawState = randomBytes(32).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const ssoState: SenaEnterpriseSsoState = {
    id: id("sso"),
    provider,
    stateHash: tokenHash(rawState),
    nonce,
    codeVerifier,
    redirectTo: safeRedirectTo(input.redirectTo),
    inviteCode: safeInviteCode(input.inviteCode),
    createdAt: now(),
    expiresAt: ssoStateExpiry()
  };
  db.ssoStates.push(ssoState);
  appendAudit(db, {
    event: "auth.sso",
    detail: {
      provider,
      phase: "start",
      mode: "oauth-oidc",
      pkce: "S256",
      nonce: "state-bound",
      invite: ssoState.inviteCode ? "present" : "none"
    }
  });

  const authorizationUrl = new URL(config.authorizationUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizationUrl.searchParams.set("scope", config.scopes);
  authorizationUrl.searchParams.set("state", rawState);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.ssoAuthorization,
    mode: "oauth-oidc" as const,
    provider,
    authorizationUrl: authorizationUrl.toString(),
    callbackUrl: config.callbackUrl,
    scopes: config.scopes.split(/\s+/).filter(Boolean),
    expiresAt: ssoState.expiresAt
  };
}

export async function createEnterpriseSsoAuthorization(input: SenaEnterpriseSsoAuthorizationInput) {
  const db = readEnterpriseDb();
  const result = await createEnterpriseSsoAuthorizationInDb(db, input);
  saveDb(db);
  return result;
}

export async function createEnterpriseSsoAuthorizationAsync(input: SenaEnterpriseSsoAuthorizationInput) {
  const state = await readEnterpriseState();
  const result = await createEnterpriseSsoAuthorizationInDb(state.db, input);
  await saveEnterpriseState(state, state.db);
  return result;
}

function profileEmail(provider: SenaEnterpriseSsoProvider, profile: Record<string, unknown>, subject: string) {
  const email = profileString(profile, "email") || profileString(profile, "preferred_username");
  return email?.includes("@") ? email : subjectEmailFallback(provider, subject);
}

function profileName(profile: Record<string, unknown>, email: string) {
  const fullName = profileString(profile, "name");
  if (fullName) return fullName;
  const joined = [profileString(profile, "given_name"), profileString(profile, "family_name")].filter(Boolean).join(" ");
  return joined || profileString(profile, "preferred_username") || email.split("@")[0];
}

function profileOrganization(profile: Record<string, unknown>, email: string) {
  return profileString(profile, "hd") ||
    profileString(profile, "organization") ||
    profileString(profile, "institution") ||
    email.split("@")[1] ||
    "SENA Research Team";
}

async function completeEnterpriseSsoCallbackInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterpriseSsoCallbackInput
) {
  const stateHash = tokenHash(input.state);
  const stateIndex = db.ssoStates.findIndex((candidate) => candidate.stateHash === stateHash);
  const ssoState = stateIndex >= 0 ? db.ssoStates[stateIndex] : undefined;
  if (!ssoState) throw new SenaEnterpriseError("SSO state is invalid or expired.", 401, "invalid_sso_state");
  if (Date.parse(ssoState.expiresAt) <= Date.now()) {
    db.ssoStates.splice(stateIndex, 1);
    throw new SenaEnterpriseError("SSO state has expired.", 401, "expired_sso_state");
  }
  if (input.provider && input.provider !== ssoState.provider) {
    throw new SenaEnterpriseError("SSO provider does not match the saved state.", 400, "sso_provider_mismatch");
  }

  const provider = ssoState.provider;
  const config = await resolveSsoProvider(provider, input.baseUrl);
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: ssoState.codeVerifier
  });
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody
  });
  if (!tokenResponse.ok) {
    throw new SenaEnterpriseError(`${provider} token exchange failed.`, 502, "sso_token_exchange_failed");
  }
  const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
  const accessToken = profileString(tokenPayload, "access_token");
  if (!accessToken) throw new SenaEnterpriseError(`${provider} token response did not include an access token.`, 502, "sso_access_token_missing");
  const idToken = profileString(tokenPayload, "id_token");
  if (idToken) {
    try {
      await validateSsoIdTokenBinding({
        provider,
        idToken,
        expectedNonce: ssoState.nonce,
        clientId: config.clientId,
        expectedIssuer: config.issuer,
        jwksUrl: config.jwksUrl
      });
    } catch (error) {
      db.ssoStates.splice(stateIndex, 1);
      throw error;
    }
  }

  const userinfoResponse = await fetch(config.userinfoUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userinfoResponse.ok) {
    throw new SenaEnterpriseError(`${provider} userinfo request failed.`, 502, "sso_userinfo_failed");
  }
  const profile = await userinfoResponse.json() as Record<string, unknown>;
  const subject = profileString(profile, "sub") || profileString(profile, "id");
  if (!subject) throw new SenaEnterpriseError(`${provider} userinfo response did not include a subject.`, 502, "sso_subject_missing");
  const email = profileEmail(provider, profile, subject);

  db.ssoStates.splice(stateIndex, 1);

  const result = ssoEnterpriseUserInDb(db, {
    provider,
    email,
    name: profileName(profile, email),
    organization: profileOrganization(profile, email),
    subject,
    inviteCode: ssoState.inviteCode
  });
  return {
    ...result,
    redirectTo: ssoState.redirectTo,
    provider
  };
}

export async function completeEnterpriseSsoCallback(input: SenaEnterpriseSsoCallbackInput) {
  const db = readEnterpriseDb();
  try {
    const result = await completeEnterpriseSsoCallbackInDb(db, input);
    saveDb(db);
    return result;
  } catch (error) {
    saveDb(db);
    throw error;
  }
}

export async function completeEnterpriseSsoCallbackAsync(input: SenaEnterpriseSsoCallbackInput) {
  const state = await readEnterpriseState();
  try {
    const result = await completeEnterpriseSsoCallbackInDb(state.db, input);
    await saveEnterpriseState(state, state.db);
    return result;
  } catch (error) {
    await saveEnterpriseState(state, state.db);
    throw error;
  }
}

function ssoEnterpriseUserInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterpriseSsoUserInput
) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new SenaEnterpriseError("A valid email is required for SSO.", 400, "invalid_email");
  const timestamp = now();
  let user = db.users.find((candidate) => candidate.email === email);
  const pendingInvite = requirePendingInvitationForEmail(db, input.inviteCode, email);

  if (!user) {
    user = {
      id: id("user"),
      email,
      name: input.name?.trim() || email.split("@")[0],
      organization: input.organization?.trim() || email.split("@")[1] || "SENA Research Team",
      ssoIdentities: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.users.push(user);
    if (!pendingInvite) {
      const team: SenaEnterpriseTeam = {
        id: id("team"),
        name: input.organization?.trim() || `${user.name}'s SENA Workspace`,
        plan: "lab",
        organization: user.organization,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      db.teams.push(team);
      db.memberships.push({
        id: id("member"),
        teamId: team.id,
        userId: user.id,
        role: "owner",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  if (pendingInvite) {
    const invitedTeam = db.teams.find((candidate) => candidate.id === pendingInvite.teamId);
    if (!invitedTeam) throw new SenaEnterpriseError("Invitation team is no longer available.", 410, "invitation_team_missing");
    const existingMembership = db.memberships.find((membership) => membership.teamId === pendingInvite.teamId && membership.userId === user.id);
    if (!existingMembership) {
      db.memberships.push({
        id: id("member"),
        teamId: pendingInvite.teamId,
        userId: user.id,
        role: pendingInvite.role,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } else {
      existingMembership.role = pendingInvite.role;
      existingMembership.status = "active";
      existingMembership.updatedAt = timestamp;
    }
    pendingInvite.status = "accepted";
    pendingInvite.acceptedAt = timestamp;
    appendAudit(db, {
      event: "team.invite.accept",
      userId: user.id,
      teamId: pendingInvite.teamId,
      detail: {
        invitationId: pendingInvite.id,
        role: pendingInvite.role,
        method: "sso"
      }
    });
  }

  const subject = input.subject || email;
  if (!user.ssoIdentities.some((identity) => identity.provider === input.provider && identity.subject === subject)) {
    user.ssoIdentities.push({ provider: input.provider, subject, linkedAt: timestamp });
    user.updatedAt = timestamp;
  }

  const session = createSession(db, user.id);
  appendAudit(db, {
    event: "auth.sso",
    userId: user.id,
    teamId: pendingInvite?.teamId,
    detail: {
      provider: input.provider,
      inviteAccepted: Boolean(pendingInvite)
    }
  });
  return { token: session.rawToken, context: contextFromDb(db, session.session) };
}

export function ssoEnterpriseUser(input: SenaEnterpriseSsoUserInput) {
  const db = readEnterpriseDb();
  const result = ssoEnterpriseUserInDb(db, input);
  saveDb(db);
  return result;
}

export async function ssoEnterpriseUserAsync(input: SenaEnterpriseSsoUserInput) {
  const state = await readEnterpriseState();
  const result = ssoEnterpriseUserInDb(state.db, input);
  await saveEnterpriseState(state, state.db);
  return result;
}
