import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import {
  envValue,
  now,
  provisioningTokenProductionEvidence,
  sha256Text
} from "./auth-config";
import {
  configHashBindingChanged,
  latestSsoPreflightByProvider,
  providerEnvPrefix,
  ssoPreflightConfigBinding,
  ssoPreflightCurrentConfigHashes,
  ssoPreflightStatus,
  ssoProviderStatus
} from "./auth-sso";
import type {
  SenaEnterpriseSsoProvider,
  SenaEnterpriseSsoProviderStatus
} from "./auth-sso";
import type {
  SenaEnterprisePlatformDecisionAcceptance
} from "./ops-platform-decisions";
import { readEnterpriseDb } from "./state";
import type { SenaEnterpriseDb } from "./state";

function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

export type SenaEnterpriseIdentityTechnicalEvidenceBinding = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding;
  decisionId: string;
  provider?: SenaEnterpriseSsoProvider;
  status: "ready" | "review";
  secretBinding?: {
    clientSecretStrength: "configured" | "weak" | "missing";
    clientSecretMinLength: 32;
    clientSecretVersionConfigured?: boolean;
    clientSecretVersionHash?: string;
    clientSecretVersionEnv?: string;
  };
  secretVersionBinding?: {
    env: string;
    configured: boolean;
    versionHash?: string;
  };
  secretStoreReferenceBinding?: {
    env: "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF" | "SENA_PROVISIONING_TOKEN_SECRET_REF";
    configured: boolean;
    requiredInProduction: boolean;
    referenceHash?: string;
  };
  secretRotationCadenceBinding?: {
    env: "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS";
    configured: boolean;
    valid: boolean;
    requiredInProduction: boolean;
    minDays: 1;
    maxDays: 180;
    cadenceDays?: number;
    cadenceHash?: string;
  };
  idpTenantBinding?: {
    env: "SENA_SSO_INSTITUTION_TENANT_ID";
    configured: boolean;
    requiredInProduction: boolean;
    tenantHash?: string;
  };
  lifecycleOwnerModeBinding?: {
    env: "SENA_IDENTITY_LIFECYCLE_OWNER_MODE";
    configured: boolean;
    valid: boolean;
    requiredInProduction: boolean;
    mode?: "scim" | "idp" | "hybrid";
    modeHash?: string;
    acceptedModes: Array<"scim" | "idp" | "hybrid">;
  };
  latestPreflightAt?: string;
  latestPreflightStatus?: string;
  configBinding?: string;
  configHashes?: Partial<Record<
    | "clientIdHash"
    | "scopesHash"
    | "endpointDiscoveryHash"
    | "issuerHash"
    | "endpointAuthorizationHash"
    | "endpointTokenHash"
    | "endpointUserinfoHash"
    | "endpointJwksHash"
    | "callbackHash",
    string
  >>;
  evidence: string[];
};

export type SenaEnterpriseIdentityRotationFreshness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness;
  generatedAt: string;
  status: "ready" | "review";
  policy: {
    maxAgeDays: number;
    warningDays: number;
  };
  summary: {
    checks: number;
    ready: number;
    dueSoon: number;
    expired: number;
    missing: number;
  };
  checks: Array<{
    id: "sso-secret-rotation" | "bearer-token-rotation";
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: "ready" | "due-soon" | "expired" | "missing";
    maxAgeDays: number;
    warningDays: number;
    ageDays: number;
    daysUntilExpiry: number;
    verifiedAtHash?: string;
    expiresAtHash?: string;
    evidenceUrlHash?: string;
    nextAction: string;
  }>;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseIdentityProductionDecisionId = "institution-idp-approval" | "institution-provisioning-owner";

export const identityProductionDecisionIds: SenaEnterpriseIdentityProductionDecisionId[] = [
  "institution-idp-approval",
  "institution-provisioning-owner"
];

export function isIdentityProductionDecisionId(id: string): id is SenaEnterpriseIdentityProductionDecisionId {
  return identityProductionDecisionIds.includes(id as SenaEnterpriseIdentityProductionDecisionId);
}

export function identitySecretVersionBinding(envName: string) {
  const value = envValue(envName)?.trim();
  return {
    env: envName,
    configured: Boolean(value),
    ...(value ? { versionHash: sha256Text(value) } : {})
  };
}

function secretVersionBindingChanged(
  accepted: { configured?: boolean; versionHash?: string } | undefined,
  current: { configured?: boolean; versionHash?: string } | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.versionHash);
  const currentConfigured = Boolean(current?.configured || current?.versionHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.versionHash !== current?.versionHash;
}

export function secretStoreReferenceBinding(
  envName: NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]>["env"]
): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]> {
  const value = envValue(envName)?.trim();
  return {
    env: envName,
    configured: Boolean(value),
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(value ? { referenceHash: sha256Text(value) } : {})
  };
}

export function secretStoreReferenceReady(
  binding: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"]
) {
  return process.env.NODE_ENV !== "production" || Boolean(binding?.configured);
}

function secretStoreReferenceChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretStoreReferenceBinding"] | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.referenceHash);
  const currentConfigured = Boolean(current?.configured || current?.referenceHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.referenceHash !== current?.referenceHash;
}

const identitySecretRotationCadenceMinDays = 1;
const identitySecretRotationCadenceMaxDays = 180;
const identitySecretRotationCadenceDefaultDays = 180;
const identitySecretRotationCadenceDefaultWarningDays = 30;

export function identitySecretRotationCadenceBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"]> {
  const env = "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS" as const;
  const rawValue = envValue(env)?.trim();
  const cadenceDays = rawValue && /^\d+$/.test(rawValue) ? Number.parseInt(rawValue, 10) : undefined;
  const valid = cadenceDays !== undefined &&
    cadenceDays >= identitySecretRotationCadenceMinDays &&
    cadenceDays <= identitySecretRotationCadenceMaxDays;
  return {
    env,
    configured: Boolean(rawValue),
    valid,
    requiredInProduction: process.env.NODE_ENV === "production",
    minDays: identitySecretRotationCadenceMinDays,
    maxDays: identitySecretRotationCadenceMaxDays,
    ...(valid && cadenceDays !== undefined ? {
      cadenceDays,
      cadenceHash: sha256Text(String(cadenceDays))
    } : {})
  };
}

export function identitySecretRotationCadenceReady(
  binding = identitySecretRotationCadenceBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.valid;
}

function identitySecretRotationCadenceChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["secretRotationCadenceBinding"] | undefined
) {
  if (process.env.NODE_ENV === "production" && (!accepted?.valid || !current?.valid)) return true;
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.cadenceHash);
  const currentConfigured = Boolean(current?.configured || current?.cadenceHash);
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.cadenceDays !== current?.cadenceDays || accepted?.cadenceHash !== current?.cadenceHash;
}

export function identitySecretRotationMaxAgeDays() {
  const cadence = identitySecretRotationCadenceBinding();
  return cadence.valid && cadence.cadenceDays ? cadence.cadenceDays : identitySecretRotationCadenceDefaultDays;
}

export function identitySecretRotationWarningDays(maxAgeDays = identitySecretRotationMaxAgeDays()) {
  return Math.min(identitySecretRotationCadenceDefaultWarningDays, maxAgeDays);
}

export function idpTenantBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"]> {
  const env = "SENA_SSO_INSTITUTION_TENANT_ID" as const;
  const value = envValue(env)?.trim();
  return {
    env,
    configured: Boolean(value),
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(value ? { tenantHash: sha256Text(value) } : {})
  };
}

export function idpTenantBindingReady(
  binding = idpTenantBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.configured;
}

function idpTenantBindingChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["idpTenantBinding"] | undefined
) {
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.tenantHash);
  const currentConfigured = Boolean(current?.configured || current?.tenantHash);
  if (process.env.NODE_ENV === "production" && !acceptedConfigured && !currentConfigured) return true;
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.tenantHash !== current?.tenantHash;
}

const identityLifecycleOwnerModes = ["scim", "idp", "hybrid"] as const;

export function identityLifecycleOwnerModeBinding(): NonNullable<SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"]> {
  const env = "SENA_IDENTITY_LIFECYCLE_OWNER_MODE" as const;
  const rawMode = envValue(env)?.trim().toLowerCase();
  const valid = Boolean(rawMode && identityLifecycleOwnerModes.includes(rawMode as typeof identityLifecycleOwnerModes[number]));
  return {
    env,
    configured: Boolean(rawMode),
    valid,
    requiredInProduction: process.env.NODE_ENV === "production",
    ...(valid ? {
      mode: rawMode as typeof identityLifecycleOwnerModes[number],
      modeHash: sha256Text(rawMode)
    } : {}),
    acceptedModes: [...identityLifecycleOwnerModes]
  };
}

export function identityLifecycleOwnerModeReady(
  binding = identityLifecycleOwnerModeBinding()
) {
  return process.env.NODE_ENV !== "production" || binding.valid;
}

function lifecycleOwnerModeBindingChanged(
  accepted: SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"] | undefined,
  current: SenaEnterpriseIdentityTechnicalEvidenceBinding["lifecycleOwnerModeBinding"] | undefined
) {
  if (process.env.NODE_ENV === "production" && (!accepted?.valid || !current?.valid)) return true;
  const acceptedConfigured = Boolean(accepted?.configured || accepted?.modeHash);
  const currentConfigured = Boolean(current?.configured || current?.modeHash);
  if (!acceptedConfigured && !currentConfigured) return false;
  if (acceptedConfigured !== currentConfigured) return true;
  return accepted?.mode !== current?.mode || accepted?.modeHash !== current?.modeHash;
}

export function ssoClientSecretVersionEnv(provider: SenaEnterpriseSsoProvider) {
  return `${providerEnvPrefix(provider)}_CLIENT_SECRET_VERSION`;
}

export function ssoSecretReadinessBinding(provider: SenaEnterpriseSsoProviderStatus) {
  const versionBinding = identitySecretVersionBinding(ssoClientSecretVersionEnv(provider.provider));
  return {
    clientSecretStrength: provider.clientSecretStrength,
    clientSecretMinLength: "32",
    clientSecretVersionConfigured: versionBinding.configured,
    clientSecretVersionHash: versionBinding.versionHash,
    clientSecretVersionEnv: versionBinding.env
  };
}

export function buildEnterpriseIdentityTechnicalEvidenceBinding(
  decisionId: string,
  db: SenaEnterpriseDb = readEnterpriseDb()
): SenaEnterpriseIdentityTechnicalEvidenceBinding | undefined {
  if (decisionId === "institution-provisioning-owner") {
    const provisioningToken = provisioningTokenProductionEvidence();
    const secretVersionBinding = identitySecretVersionBinding("SENA_PROVISIONING_TOKEN_VERSION");
    const secretStoreBinding = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
    const secretRotationCadenceBinding = identitySecretRotationCadenceBinding();
    const lifecycleOwnerModeBinding = identityLifecycleOwnerModeBinding();
    const lifecycleOwnerModeReady = identityLifecycleOwnerModeReady(lifecycleOwnerModeBinding);
    const status: SenaEnterpriseIdentityTechnicalEvidenceBinding["status"] =
      provisioningToken.ready &&
      secretStoreReferenceReady(secretStoreBinding) &&
      lifecycleOwnerModeReady &&
      identitySecretRotationCadenceReady(secretRotationCadenceBinding)
        ? "ready"
        : "review";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding,
      decisionId,
      status,
      configBinding: "current",
      secretVersionBinding,
      secretStoreReferenceBinding: secretStoreBinding,
      secretRotationCadenceBinding,
      lifecycleOwnerModeBinding,
      evidence: [
        "schema=sena-enterprise-identity-technical-evidence-binding/v1",
        "technicalPrerequisite=provisioning-token",
        `status=${status}`,
        `rotationCadenceDays=${secretRotationCadenceBinding.cadenceDays ?? "missing"}`,
        `rotationCadenceValid=${secretRotationCadenceBinding.valid}`,
        `rotationCadenceRequiredInProduction=${secretRotationCadenceBinding.requiredInProduction}`,
        `rotationCadenceHash=${secretRotationCadenceBinding.cadenceHash ? "present" : "missing"}`,
        `rotationCadenceEnv=${secretRotationCadenceBinding.env}`,
        `secretStoreReference=${secretStoreBinding.referenceHash ? "present" : "missing"}`,
        `secretStoreReferenceRequiredInProduction=${secretStoreBinding.requiredInProduction}`,
        `secretStoreReferenceEnv=${secretStoreBinding.env}`,
        `lifecycleOwnerMode=${lifecycleOwnerModeBinding.mode ?? "missing"}`,
        `lifecycleOwnerModeValid=${lifecycleOwnerModeBinding.valid}`,
        `lifecycleOwnerModeRequiredInProduction=${lifecycleOwnerModeBinding.requiredInProduction}`,
        `lifecycleOwnerModeHash=${lifecycleOwnerModeBinding.modeHash ? "present" : "missing"}`,
        `lifecycleOwnerModeEnv=${lifecycleOwnerModeBinding.env}`,
        `provisioningTokenVersionHash=${secretVersionBinding.versionHash ? "present" : "missing"}`,
        `provisioningTokenVersionEnv=${secretVersionBinding.env}`,
        ...provisioningToken.evidence,
        "secretHashing=disabled"
      ]
    };
  }
  if (decisionId !== "institution-idp-approval") return undefined;
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return undefined;
  const entry = latestSsoPreflightByProvider(db).get("institution");
  const latestPreflightStatus = ssoPreflightStatus(entry, provider);
  const configBinding = ssoPreflightConfigBinding(entry, provider);
  const secretBinding = ssoSecretReadinessBinding(provider);
  const secretStoreBinding = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
  const tenantBinding = idpTenantBinding();
  const secretRotationCadenceBinding = identitySecretRotationCadenceBinding();
  const configHashes = Object.fromEntries(
    Object.entries(ssoPreflightCurrentConfigHashes(provider)).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ) as SenaEnterpriseIdentityTechnicalEvidenceBinding["configHashes"];
  const status: SenaEnterpriseIdentityTechnicalEvidenceBinding["status"] =
    provider.configured &&
    latestPreflightStatus === "pass" &&
    secretStoreReferenceReady(secretStoreBinding) &&
    idpTenantBindingReady(tenantBinding) &&
    identitySecretRotationCadenceReady(secretRotationCadenceBinding)
      ? "ready"
      : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding,
    decisionId,
    provider: "institution",
    status,
    secretBinding: {
      clientSecretStrength: secretBinding.clientSecretStrength,
      clientSecretMinLength: 32,
      clientSecretVersionConfigured: secretBinding.clientSecretVersionConfigured,
      ...(secretBinding.clientSecretVersionHash ? { clientSecretVersionHash: secretBinding.clientSecretVersionHash } : {}),
      clientSecretVersionEnv: secretBinding.clientSecretVersionEnv
    },
    secretStoreReferenceBinding: secretStoreBinding,
    secretRotationCadenceBinding,
    idpTenantBinding: tenantBinding,
    ...(entry?.createdAt ? { latestPreflightAt: entry.createdAt } : {}),
    latestPreflightStatus,
    configBinding,
    configHashes,
    evidence: [
      "schema=sena-enterprise-identity-technical-evidence-binding/v1",
      "provider=institution",
      `status=${status}`,
      `preflight=${latestPreflightStatus}`,
      `configBinding=${configBinding}`,
      `hashes=${Object.keys(configHashes ?? {}).sort().join("|") || "none"}`,
      `clientSecretStrength=${secretBinding.clientSecretStrength}`,
      `clientSecretMinLength=${secretBinding.clientSecretMinLength}`,
      `clientSecretVersionHash=${secretBinding.clientSecretVersionHash ? "present" : "missing"}`,
      `clientSecretVersionEnv=${secretBinding.clientSecretVersionEnv}`,
      `secretStoreReference=${secretStoreBinding.referenceHash ? "present" : "missing"}`,
      `secretStoreReferenceRequiredInProduction=${secretStoreBinding.requiredInProduction}`,
      `secretStoreReferenceEnv=${secretStoreBinding.env}`,
      `rotationCadenceDays=${secretRotationCadenceBinding.cadenceDays ?? "missing"}`,
      `rotationCadenceValid=${secretRotationCadenceBinding.valid}`,
      `rotationCadenceRequiredInProduction=${secretRotationCadenceBinding.requiredInProduction}`,
      `rotationCadenceHash=${secretRotationCadenceBinding.cadenceHash ? "present" : "missing"}`,
      `rotationCadenceEnv=${secretRotationCadenceBinding.env}`,
      `tenantBinding=${tenantBinding.configured ? "configured" : "missing"}`,
      `tenantBindingRequiredInProduction=${tenantBinding.requiredInProduction}`,
      `tenantHash=${tenantBinding.tenantHash ? "present" : "missing"}`,
      `tenantEnv=${tenantBinding.env}`,
      "secretHashing=disabled"
    ]
  };
}

export function identityTechnicalEvidenceBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">,
  db: SenaEnterpriseDb = readEnterpriseDb()
): "current" | "stale" | "not-required" {
  const binding = acceptance.technicalEvidenceBinding;
  if (acceptance.decisionId === "institution-provisioning-owner") {
    if (!binding) return "stale";
    if (
      binding.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding ||
      binding.decisionId !== "institution-provisioning-owner"
    ) {
      return "stale";
    }
    const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-provisioning-owner", db);
    if (!current || binding.status !== current.status) return "stale";
    if (secretVersionBindingChanged(binding.secretVersionBinding, current.secretVersionBinding)) return "stale";
    if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, current.secretStoreReferenceBinding)) return "stale";
    if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, current.secretRotationCadenceBinding)) return "stale";
    if (lifecycleOwnerModeBindingChanged(binding.lifecycleOwnerModeBinding, current.lifecycleOwnerModeBinding)) return "stale";
    const comparableEvidence = (entries: string[]) => entries.filter((entry) => (
      !entry.startsWith("provisioningTokenVersionHash=") &&
      !entry.startsWith("provisioningTokenVersionEnv=") &&
      !entry.startsWith("secretStoreReference=") &&
      !entry.startsWith("secretStoreReferenceRequiredInProduction=") &&
      !entry.startsWith("secretStoreReferenceEnv=") &&
      !entry.startsWith("rotationCadenceDays=") &&
      !entry.startsWith("rotationCadenceValid=") &&
      !entry.startsWith("rotationCadenceRequiredInProduction=") &&
      !entry.startsWith("rotationCadenceHash=") &&
      !entry.startsWith("rotationCadenceEnv=") &&
      !entry.startsWith("lifecycleOwnerMode=") &&
      !entry.startsWith("lifecycleOwnerModeValid=") &&
      !entry.startsWith("lifecycleOwnerModeRequiredInProduction=") &&
      !entry.startsWith("lifecycleOwnerModeHash=") &&
      !entry.startsWith("lifecycleOwnerModeEnv=")
    ));
    const acceptedEvidence = new Set(comparableEvidence(binding.evidence));
    const currentEvidence = new Set(comparableEvidence(current.evidence));
    if (acceptedEvidence.size !== currentEvidence.size) return "stale";
    for (const entry of currentEvidence) {
      if (!acceptedEvidence.has(entry)) return "stale";
    }
    return "current";
  }
  if (acceptance.decisionId !== "institution-idp-approval") return "not-required";
  if (!binding || binding.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding || binding.provider !== "institution") {
    return "stale";
  }
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return "stale";
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-idp-approval", db);
  if (
    !current ||
    binding.status !== current.status ||
    binding.latestPreflightStatus !== current.latestPreflightStatus ||
    binding.configBinding !== current.configBinding
  ) {
    return "stale";
  }
  const currentSecretBinding = ssoSecretReadinessBinding(provider);
  if (!binding.secretBinding || (
    binding.secretBinding.clientSecretStrength !== currentSecretBinding.clientSecretStrength ||
    String(binding.secretBinding.clientSecretMinLength) !== currentSecretBinding.clientSecretMinLength
  )) {
    return "stale";
  }
  if (secretVersionBindingChanged({
    configured: binding.secretBinding.clientSecretVersionConfigured,
    versionHash: binding.secretBinding.clientSecretVersionHash
  }, {
    configured: currentSecretBinding.clientSecretVersionConfigured,
    versionHash: currentSecretBinding.clientSecretVersionHash
  })) {
    return "stale";
  }
  if (idpTenantBindingChanged(binding.idpTenantBinding, current.idpTenantBinding)) return "stale";
  if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, current.secretStoreReferenceBinding)) return "stale";
  if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, current.secretRotationCadenceBinding)) return "stale";
  const currentHashes = current.configHashes ?? ssoPreflightCurrentConfigHashes(provider);
  const acceptedHashes = binding.configHashes ?? {};
  return configHashBindingChanged(acceptedHashes, currentHashes) ? "stale" : "current";
}

export function identityPlatformEvidenceBindingStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
): "current" | "stale" | "not-required" {
  if (acceptance.decisionId !== "institution-idp-approval") {
    return identityTechnicalEvidenceBindingStatus(acceptance);
  }
  const binding = acceptance.technicalEvidenceBinding;
  if (!binding || binding.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseIdentityTechnicalEvidenceBinding || binding.provider !== "institution") {
    return "stale";
  }
  const provider = ssoProviderStatus("institution");
  if (!provider.configured) return "stale";
  const currentSecretBinding = ssoSecretReadinessBinding(provider);
  if (!binding.secretBinding || (
    binding.secretBinding.clientSecretStrength !== currentSecretBinding.clientSecretStrength ||
    String(binding.secretBinding.clientSecretMinLength) !== currentSecretBinding.clientSecretMinLength
  )) {
    return "stale";
  }
  if (secretVersionBindingChanged({
    configured: binding.secretBinding.clientSecretVersionConfigured,
    versionHash: binding.secretBinding.clientSecretVersionHash
  }, {
    configured: currentSecretBinding.clientSecretVersionConfigured,
    versionHash: currentSecretBinding.clientSecretVersionHash
  })) {
    return "stale";
  }
  if (idpTenantBindingChanged(binding.idpTenantBinding, idpTenantBinding())) return "stale";
  if (secretStoreReferenceChanged(binding.secretStoreReferenceBinding, secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"))) return "stale";
  if (identitySecretRotationCadenceChanged(binding.secretRotationCadenceBinding, identitySecretRotationCadenceBinding())) return "stale";
  const currentHashes = ssoPreflightCurrentConfigHashes(provider);
  const acceptedHashes = binding.configHashes ?? {};
  return configHashBindingChanged(acceptedHashes, currentHashes) ? "stale" : "current";
}

export function identityTechnicalReadinessStatus(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">,
  db: SenaEnterpriseDb = readEnterpriseDb()
): "ready" | "review" | "not-required" {
  if (!isIdentityProductionDecisionId(acceptance.decisionId)) return "not-required";
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding(acceptance.decisionId, db);
  if (!current) return "review";
  return current.status === "ready" ? "ready" : "review";
}

export function identityTechnicalEvidenceBindingEvidence(
  acceptance: Pick<SenaEnterprisePlatformDecisionAcceptance, "decisionId" | "technicalEvidenceBinding">
) {
  const status = identityTechnicalEvidenceBindingStatus(acceptance);
  if (status === "not-required") return ["technicalBinding=not-required"];
  const binding = acceptance.technicalEvidenceBinding;
  if (acceptance.decisionId === "institution-provisioning-owner") {
    const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-provisioning-owner");
    return [
      `technicalBinding=${status}`,
      `bindingSchema=${binding?.schemaVersion ?? "missing"}`,
      `acceptedProvisioningStatus=${binding?.status ?? "missing"}`,
      `currentProvisioningStatus=${current?.status ?? "missing"}`,
      `acceptedLifecycleOwnerMode=${binding?.lifecycleOwnerModeBinding?.mode ?? "missing"}`,
      `currentLifecycleOwnerMode=${current?.lifecycleOwnerModeBinding?.mode ?? "missing"}`,
      `acceptedProvisioningTokenVersionHash=${binding?.secretVersionBinding?.versionHash ? "present" : "missing"}`,
      `currentProvisioningTokenVersionHash=${current?.secretVersionBinding?.versionHash ? "present" : "missing"}`,
      `acceptedSecretStoreReference=${binding?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
      `currentSecretStoreReference=${current?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
      `secretStoreReferenceEnv=${current?.secretStoreReferenceBinding?.env ?? "SENA_PROVISIONING_TOKEN_SECRET_REF"}`,
      `acceptedRotationCadence=${binding?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
      `currentRotationCadence=${current?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
      `rotationCadenceEnv=${current?.secretRotationCadenceBinding?.env ?? "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"}`,
      `acceptedProvisioningEvidence=${binding?.evidence.join("|") || "missing"}`,
      `currentProvisioningEvidence=${current?.evidence.join("|") || "missing"}`
    ];
  }
  const current = buildEnterpriseIdentityTechnicalEvidenceBinding("institution-idp-approval");
  return [
    `technicalBinding=${status}`,
    `bindingSchema=${binding?.schemaVersion ?? "missing"}`,
    `provider=${binding?.provider ?? "missing"}`,
    `acceptedTechnicalStatus=${binding?.status ?? "missing"}`,
    `currentTechnicalStatus=${current?.status ?? "missing"}`,
    `acceptedPreflight=${binding?.latestPreflightStatus ?? "missing"}`,
    `currentPreflight=${current?.latestPreflightStatus ?? "missing"}`,
    `acceptedConfigBinding=${binding?.configBinding ?? "missing"}`,
    `currentConfigBinding=${current?.configBinding ?? "missing"}`,
    `acceptedHashKeys=${Object.keys(binding?.configHashes ?? {}).sort().join("|") || "missing"}`,
    `acceptedClientSecretStrength=${binding?.secretBinding?.clientSecretStrength ?? "missing"}`,
    `currentClientSecretStrength=${current?.secretBinding?.clientSecretStrength ?? ssoProviderStatus("institution").clientSecretStrength}`,
    `acceptedClientSecretVersionHash=${binding?.secretBinding?.clientSecretVersionHash ? "present" : "missing"}`,
    `currentClientSecretVersionHash=${current?.secretBinding?.clientSecretVersionHash ? "present" : "missing"}`,
    `acceptedSecretStoreReference=${binding?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
    `currentSecretStoreReference=${current?.secretStoreReferenceBinding?.referenceHash ? "present" : "missing"}`,
    `secretStoreReferenceEnv=${current?.secretStoreReferenceBinding?.env ?? "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"}`,
    `acceptedTenantBinding=${binding?.idpTenantBinding?.tenantHash ? "present" : "missing"}`,
    `currentTenantBinding=${current?.idpTenantBinding?.tenantHash ? "present" : "missing"}`,
    `tenantBindingEnv=${current?.idpTenantBinding?.env ?? "SENA_SSO_INSTITUTION_TENANT_ID"}`,
    `acceptedRotationCadence=${binding?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
    `currentRotationCadence=${current?.secretRotationCadenceBinding?.cadenceDays ?? "missing"}`,
    `rotationCadenceEnv=${current?.secretRotationCadenceBinding?.env ?? "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"}`
  ];
}

export const platformDecisionProductionEvidenceIdsByDecision: Record<string, string[]> = {
  "institution-idp-approval": ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
  "institution-provisioning-owner": ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]
};

export const identityRotationFreshnessPolicy = {
  get maxAgeDays() {
    return identitySecretRotationMaxAgeDays();
  },
  get warningDays() {
    return identitySecretRotationWarningDays(this.maxAgeDays);
  }
};

export const identityRotationFreshnessSpecs: Array<{
  id: "sso-secret-rotation" | "bearer-token-rotation";
  decisionId: SenaEnterpriseIdentityProductionDecisionId;
  label: string;
}> = [
  {
    id: "sso-secret-rotation",
    decisionId: "institution-idp-approval",
    label: "SSO client secret rotation evidence"
  },
  {
    id: "bearer-token-rotation",
    decisionId: "institution-provisioning-owner",
    label: "Provisioning bearer-token rotation evidence"
  }
];

export function normalizedProductionEvidenceIds(decisionId: string, values: string[] = []) {
  const normalized = Array.from(new Set(values
    .map((value) => value.trim())
    .filter(Boolean)))
    .slice(0, 50);
  const allowedIds = platformDecisionProductionEvidenceIdsByDecision[decisionId];
  if (allowedIds) {
    const invalid = normalized.filter((value) => !allowedIds.includes(value));
    if (invalid.length > 0) {
      throw new SenaEnterpriseError(
        `Platform decision production evidence ids are not valid for ${decisionId}: ${invalid.join(", ")}.`,
        400,
        "invalid_platform_decision_production_evidence"
      );
    }
  }
  return normalized;
}

export function rotationFreshnessCheck(
  spec: typeof identityRotationFreshnessSpecs[number],
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined
): SenaEnterpriseIdentityRotationFreshness["checks"][number] {
  const maxAgeMs = identityRotationFreshnessPolicy.maxAgeDays * 24 * 60 * 60 * 1000;
  const warningMs = identityRotationFreshnessPolicy.warningDays * 24 * 60 * 60 * 1000;
  const hasEvidence = Boolean(
    acceptance?.status === "accepted" &&
    acceptance.acceptedBridge &&
    acceptance.evidenceUrlHash &&
    acceptance.productionEvidenceIds?.includes(spec.id)
  );
  if (!hasEvidence || !acceptance) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      nextAction: `Attach fresh ${spec.label.toLowerCase()} before production release.`
    };
  }
  const verifiedAt = acceptance.productionEvidenceVerifiedAt;
  if (!verifiedAt) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      evidenceUrlHash: acceptance.evidenceUrlHash,
      nextAction: `Attach ${spec.label.toLowerCase()} with a platform production evidence verification timestamp before production release.`
    };
  }
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > Date.now()) {
    return {
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "missing",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: 0,
      verifiedAtHash: sha256Text(verifiedAt)!,
      evidenceUrlHash: acceptance.evidenceUrlHash,
      nextAction: `Record a valid past-or-present ISO production evidence verification timestamp for ${spec.label.toLowerCase()} before production release.`
    };
  }
  const ageMs = Math.max(0, Date.now() - verifiedAtMs);
  const expiresAtMs = verifiedAtMs + maxAgeMs;
  const daysUntilExpiry = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
  const status: SenaEnterpriseIdentityRotationFreshness["checks"][number]["status"] = Date.now() >= expiresAtMs
    ? "expired"
    : expiresAtMs - Date.now() <= warningMs
      ? "due-soon"
      : "ready";
  return {
    id: spec.id,
    decisionId: spec.decisionId,
    label: spec.label,
    status,
    maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
    warningDays: identityRotationFreshnessPolicy.warningDays,
    ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
    daysUntilExpiry,
    verifiedAtHash: sha256Text(verifiedAt)!,
    expiresAtHash: sha256Text(new Date(expiresAtMs).toISOString())!,
    evidenceUrlHash: acceptance.evidenceUrlHash,
    nextAction: status === "expired"
      ? `Refresh ${spec.label.toLowerCase()} and record a new platform decision acceptance.`
      : status === "due-soon"
        ? `Schedule ${spec.label.toLowerCase()} renewal before the current rotation evidence expires.`
        : `Keep ${spec.label.toLowerCase()} attached to release checks.`
  };
}

export function buildEnterpriseIdentityRotationFreshness(
  acceptances: Map<string, SenaEnterprisePlatformDecisionAcceptance>,
  generatedAt: string = now()
): SenaEnterpriseIdentityRotationFreshness {
  if (isSelfManagedEnterpriseMode()) {
    const checks: SenaEnterpriseIdentityRotationFreshness["checks"] = identityRotationFreshnessSpecs.map((spec) => ({
      id: spec.id,
      decisionId: spec.decisionId,
      label: spec.label,
      status: "ready",
      maxAgeDays: identityRotationFreshnessPolicy.maxAgeDays,
      warningDays: identityRotationFreshnessPolicy.warningDays,
      ageDays: 0,
      daysUntilExpiry: identityRotationFreshnessPolicy.maxAgeDays,
      nextAction: "Institution identity secret rotation evidence is not applicable in self-managed enterprise mode; rotate local secrets through the self-managed runbook."
    }));
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
      generatedAt,
      status: "ready",
      policy: identityRotationFreshnessPolicy,
      summary: {
        checks: checks.length,
        ready: checks.length,
        dueSoon: 0,
        expired: 0,
        missing: 0
      },
      checks,
      evidence: [
        "schema=sena-enterprise-identity-rotation-freshness/v1",
        "status=ready",
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable",
        "missing=none"
      ],
      nextActions: []
    };
  }
  const checks = identityRotationFreshnessSpecs.map((spec) => rotationFreshnessCheck(spec, acceptances.get(spec.decisionId)));
  const expired = checks.filter((check) => check.status === "expired").length;
  const missing = checks.filter((check) => check.status === "missing").length;
  const dueSoon = checks.filter((check) => check.status === "due-soon").length;
  const ready = checks.filter((check) => check.status === "ready").length;
  const status: SenaEnterpriseIdentityRotationFreshness["status"] = expired > 0 || missing > 0 ? "review" : "ready";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
    generatedAt,
    status,
    policy: identityRotationFreshnessPolicy,
    summary: {
      checks: checks.length,
      ready,
      dueSoon,
      expired,
      missing
    },
    checks,
    evidence: [
      "schema=sena-enterprise-identity-rotation-freshness/v1",
      `status=${status}`,
      `maxAgeDays=${identityRotationFreshnessPolicy.maxAgeDays}`,
      `warningDays=${identityRotationFreshnessPolicy.warningDays}`,
      `expired=${checks.filter((check) => check.status === "expired").map((check) => check.id).join("|") || "none"}`,
      `dueSoon=${checks.filter((check) => check.status === "due-soon").map((check) => check.id).join("|") || "none"}`,
      `missing=${checks.filter((check) => check.status === "missing").map((check) => check.id).join("|") || "none"}`
    ],
    nextActions: Array.from(new Set(checks
      .filter((check) => check.status !== "ready")
      .map((check) => check.nextAction)))
  };
}

export function platformDecisionProductionEvidenceFresh(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  evidenceId: string
) {
  const requiresProductionEvidenceTimestamp = acceptance
    ? platformDecisionProductionEvidenceIdsByDecision[acceptance.decisionId]?.includes(evidenceId) === true
    : false;
  if (acceptance && requiresProductionEvidenceTimestamp) {
    const verifiedAtMs = Date.parse(acceptance.productionEvidenceVerifiedAt ?? "");
    if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > Date.now()) return false;
  }
  const rotationSpec = identityRotationFreshnessSpecs.find((spec) => spec.id === evidenceId);
  if (!rotationSpec) return true;
  const check = rotationFreshnessCheck(rotationSpec, acceptance);
  return check.status === "ready" || check.status === "due-soon";
}
