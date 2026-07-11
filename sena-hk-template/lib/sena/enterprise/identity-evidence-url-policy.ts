import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  configuredSenaAppOrigin,
  envValue,
  isLocalOrPrivateIdentityEvidenceHost,
  isReservedIdentityEvidenceHost,
  sha256Text
} from "./auth-config";
import {
  identityProductionDecisionIds,
  isIdentityProductionDecisionId,
  platformDecisionProductionEvidenceIdsByDecision,
  type SenaEnterpriseIdentityProductionDecisionId
} from "./identity-readiness";
import type { SenaEnterprisePlatformDecisionAcceptance } from "./ops-platform-decisions";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";

export type SenaEnterpriseIdentityEvidenceUrlHostBinding = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding;
  status: "ready" | "review";
  allowedHostConfigStatus: "configured" | "not-configured" | "invalid";
  allowedHostCount: number;
  invalidAllowedHostCount: number;
  current: number;
  stale: number;
  missing: number;
  currentDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  staleDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  missingDecisionIds: SenaEnterpriseIdentityProductionDecisionId[];
  evidence: string[];
};

function normalizeIdentityEvidenceAllowedHost(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

function isForbiddenIdentityEvidenceAllowedHost(hostname: string) {
  if (isLocalOrPrivateIdentityEvidenceHost(hostname) || isReservedIdentityEvidenceHost(hostname)) return true;
  const appOrigin = configuredSenaAppOrigin();
  if (!appOrigin) return false;
  return new URL(appOrigin).hostname.toLowerCase().replace(/\.$/, "") === hostname.toLowerCase().replace(/\.$/, "");
}

export function identityEvidenceAllowedHostConfig() {
  const configured = envValue("SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");
  if (!configured) return { configured: false, hosts: [], invalidCount: 0 };
  const entries = configured.split(/[,\s]+/).filter(Boolean);
  const hosts: string[] = [];
  let invalidCount = 0;
  for (const entry of entries) {
    const host = normalizeIdentityEvidenceAllowedHost(entry);
    if (host && !isForbiddenIdentityEvidenceAllowedHost(host)) {
      hosts.push(host);
    } else {
      invalidCount += 1;
    }
  }
  return {
    configured: true,
    hosts: Array.from(new Set(hosts)),
    invalidCount
  };
}

function identityEvidenceAllowedHosts() {
  return identityEvidenceAllowedHostConfig().hosts;
}

function normalizedIdentityEvidenceHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function identityEvidenceAllowedHostMatch(hostname: string, allowedHosts = identityEvidenceAllowedHosts()) {
  const host = normalizedIdentityEvidenceHostname(hostname);
  return allowedHosts.find((allowedHost) =>
    host === allowedHost || host.endsWith(`.${allowedHost}`)
  );
}

export function identityEvidenceHostAllowed(hostname: string, allowedHosts = identityEvidenceAllowedHosts()) {
  return Boolean(identityEvidenceAllowedHostMatch(hostname, allowedHosts));
}

export function identityEvidenceUrlHostHashes(evidenceUrl: string | undefined) {
  if (!evidenceUrl) return {};
  const url = new URL(evidenceUrl);
  const host = normalizedIdentityEvidenceHostname(url.hostname);
  const allowedHost = identityEvidenceAllowedHostMatch(host);
  return {
    evidenceUrlPathHash: sha256Text(url.pathname),
    evidenceUrlHostHash: sha256Text(host),
    ...(allowedHost ? { evidenceUrlAllowedHostHash: sha256Text(allowedHost) } : {})
  };
}

export function identityEvidenceUrlHostBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  if (!isIdentityProductionDecisionId(acceptance.decisionId)) return "not-required" as const;
  if (!acceptance.evidenceUrlHash || !acceptance.evidenceUrlHostHash) return "stale" as const;
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  if (!allowedHostConfig.configured) {
    return process.env.NODE_ENV === "production" ? "stale" as const : "current" as const;
  }
  if (allowedHostConfig.hosts.length === 0 || allowedHostConfig.invalidCount > 0) return "stale" as const;
  const allowedHostHashes = new Set(allowedHostConfig.hosts.map((host) => sha256Text(host)).filter(Boolean));
  if (acceptance.evidenceUrlAllowedHostHash && allowedHostHashes.has(acceptance.evidenceUrlAllowedHostHash)) return "current" as const;
  return allowedHostHashes.has(acceptance.evidenceUrlHostHash) ? "current" as const : "stale" as const;
}

export function identityEvidenceUrlHostBindingEvidence(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlPathHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  return [
    `evidenceUrlHostBinding=${identityEvidenceUrlHostBindingStatus(acceptance)}`,
    `acceptedEvidenceUrlHash=${acceptance.evidenceUrlHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlPathHash=${acceptance.evidenceUrlPathHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlHostHash=${acceptance.evidenceUrlHostHash ? "present" : "missing"}`,
    `acceptedEvidenceUrlAllowedHostHash=${acceptance.evidenceUrlAllowedHostHash ? "present" : "missing"}`,
    `allowedHostConfig=${allowedHostConfig.configured ? "configured" : "not-configured"}`,
    `allowedHostHashes=${allowedHostConfig.hosts.length}`,
    `invalidAllowedHosts=${allowedHostConfig.invalidCount}`
  ];
}

export function identityEvidenceUrlHostBindingCurrent(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "evidenceUrlHash" | "evidenceUrlHostHash" | "evidenceUrlAllowedHostHash">
) {
  return identityEvidenceUrlHostBindingStatus(acceptance) !== "stale";
}

export const identityEvidenceUrlSensitiveQueryParameters = [
  "access_token",
  "api_key",
  "client_secret",
  "code",
  "id_token",
  "key",
  "password",
  "refresh_token",
  "secret",
  "sig",
  "signature",
  "token"
];

export function identityEvidenceUrlRejectedSensitiveQueryParameters(url: URL) {
  const rejected = new Set(identityEvidenceUrlSensitiveQueryParameters);
  return Array.from(new Set(Array.from(url.searchParams.keys())
    .map((key) => key.trim().toLowerCase())
    .filter((key) => rejected.has(key))))
    .sort();
}

export function identityProductionEvidenceNotesPolicy() {
  return {
    secretValuesRejected: true as const,
    bearerTokensRejected: true as const,
    rejectedSensitiveAssignmentNames: identityEvidenceUrlSensitiveQueryParameters
  };
}

export function identityProductionEvidenceFreeTextPolicy() {
  return {
    secretValuesRejected: true as const,
    bearerTokensRejected: true as const,
    fields: ["ownerName", "ownerRole", "environment", "notes"] as Array<"ownerName" | "ownerRole" | "environment" | "notes">,
    rejectedSensitiveAssignmentNames: identityEvidenceUrlSensitiveQueryParameters
  };
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function identityProductionEvidenceNoteSecretCarriers(notes: string) {
  const assignmentNames = identityEvidenceUrlSensitiveQueryParameters.map(escapeRegExpLiteral).join("|");
  const sensitiveAssignment = new RegExp(`\\b(?:${assignmentNames})\\b\\s*(?:=|:)\\s*\\S{8,}`, "i");
  const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i;
  return [
    sensitiveAssignment.test(notes) ? "sensitive-assignment" : null,
    bearerToken.test(notes) ? "bearer-token" : null
  ].filter((item): item is string => Boolean(item));
}

export function identityProductionEvidenceFreeTextSecretCarriers(fields: Array<{ field: "ownerName" | "ownerRole" | "environment" | "notes"; value: string }>) {
  return fields
    .filter((field) => identityProductionEvidenceNoteSecretCarriers(field.value).length > 0)
    .map((field) => field.field);
}

export function identityEvidenceUrlHasSpecificEvidencePath(url: URL) {
  return url.pathname.split("/").some((segment) => {
    try {
      return decodeURIComponent(segment).trim().length > 0;
    } catch {
      return segment.trim().length > 0;
    }
  });
}

export function buildEnterpriseIdentityEvidenceUrlHostBinding(
  latestIdentityAcceptances: Map<string, SenaEnterprisePlatformDecisionAcceptance>
): SenaEnterpriseIdentityEvidenceUrlHostBinding {
  if (isSelfManagedEnterpriseMode()) {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding,
      status: "ready",
      allowedHostConfigStatus: "not-configured",
      allowedHostCount: 0,
      invalidAllowedHostCount: 0,
      current: identityProductionDecisionIds.length,
      stale: 0,
      missing: 0,
      currentDecisionIds: [...identityProductionDecisionIds],
      staleDecisionIds: [],
      missingDecisionIds: [],
      evidence: [
        "schema=sena-enterprise-identity-evidence-url-host-binding/v1",
        "status=ready",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable",
        "evidenceUrlHostBinding=not-required"
      ]
    };
  }
  const currentDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  const staleDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  const missingDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [];
  for (const decisionId of identityProductionDecisionIds) {
    const acceptance = latestIdentityAcceptances.get(decisionId);
    if (!acceptance?.evidenceUrlHash || !acceptance.evidenceUrlHostHash) {
      missingDecisionIds.push(decisionId);
      continue;
    }
    const status = identityEvidenceUrlHostBindingStatus(acceptance);
    if (status === "stale") {
      staleDecisionIds.push(decisionId);
    } else {
      currentDecisionIds.push(decisionId);
    }
  }
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  const allowedHostConfigStatus: SenaEnterpriseIdentityEvidenceUrlHostBinding["allowedHostConfigStatus"] =
    !allowedHostConfig.configured
      ? "not-configured"
      : allowedHostConfig.hosts.length > 0 && allowedHostConfig.invalidCount === 0
        ? "configured"
        : "invalid";
  const status: SenaEnterpriseIdentityEvidenceUrlHostBinding["status"] =
    staleDecisionIds.length > 0 || missingDecisionIds.length > 0 ? "review" : "ready";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityEvidenceUrlHostBinding,
    status,
    allowedHostConfigStatus,
    allowedHostCount: allowedHostConfig.hosts.length,
    invalidAllowedHostCount: allowedHostConfig.invalidCount,
    current: currentDecisionIds.length,
    stale: staleDecisionIds.length,
    missing: missingDecisionIds.length,
    currentDecisionIds,
    staleDecisionIds,
    missingDecisionIds,
    evidence: [
      "schema=sena-enterprise-identity-evidence-url-host-binding/v1",
      `status=${status}`,
      `current=${currentDecisionIds.length}`,
      `stale=${staleDecisionIds.length}`,
      `missing=${missingDecisionIds.length}`,
      `staleDecisionIds=${staleDecisionIds.join("|") || "none"}`,
      `missingDecisionIds=${missingDecisionIds.join("|") || "none"}`,
      `allowedHostConfig=${allowedHostConfig.configured ? "configured" : "not-configured"}`,
      `allowedHostHashes=${allowedHostConfig.hosts.length}`,
      `invalidAllowedHosts=${allowedHostConfig.invalidCount}`,
      "redaction=evidence-url-hosts-hashed"
    ]
  };
}

export function identityEvidenceUrlPolicy() {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  const allowedHosts = allowedHostConfig.hosts;
  const appOrigin = configuredSenaAppOrigin();
  const evidenceUrlRequiredForEvidenceIds = identityProductionDecisionIds.flatMap((decisionId) =>
    platformDecisionProductionEvidenceIdsByDecision[decisionId] ?? []
  );
  const allowedHostConfigStatus = allowedHostConfig.configured
    ? allowedHosts.length > 0 && allowedHostConfig.invalidCount === 0
      ? "configured" as const
      : "invalid" as const
    : undefined;
  return {
    requiredProtocol: "https" as const,
    institutionOwnedRequired: true as const,
    evidenceUrlRequiredForProductionEvidence: true as const,
    evidenceUrlRequiredForEvidenceIds,
    specificEvidencePathRequired: true as const,
    senaAppOriginRequiredForProductionEvidence: true as const,
    senaAppOriginConfigured: Boolean(appOrigin),
    ...(appOrigin ? { senaAppOriginHash: sha256Text(appOrigin)! } : {}),
    embeddedCredentialsRejected: true as const,
    fragmentsRejected: true as const,
    sensitiveQueryParametersRejected: true as const,
    rejectedSensitiveQueryParameters: identityEvidenceUrlSensitiveQueryParameters,
    allowedHostConfigRequiredInProduction: true as const,
    forbiddenHostKinds: ["local-or-private", "sena-application-origin", "reserved-example-or-test"] as Array<"local-or-private" | "sena-application-origin" | "reserved-example-or-test">,
    ...(allowedHostConfigStatus ? { allowedHostConfigStatus } : {}),
    ...(allowedHostConfig.invalidCount > 0 ? { invalidAllowedHostCount: allowedHostConfig.invalidCount } : {}),
    ...(allowedHosts.length > 0 ? {
      allowedHostCount: allowedHosts.length,
      allowedHostHashes: allowedHosts.map((host) => sha256Text(host)!).sort()
    } : {})
  };
}

export function identityEvidenceAllowedHostEvidence() {
  const allowedHostConfig = identityEvidenceAllowedHostConfig();
  if (!allowedHostConfig.configured) return "not-configured";
  if (allowedHostConfig.hosts.length === 0 || allowedHostConfig.invalidCount > 0) {
    return `invalid:${allowedHostConfig.invalidCount}`;
  }
  return String(allowedHostConfig.hosts.length);
}
