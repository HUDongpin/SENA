import {
  identityEvidenceUrlHostBindingCurrent
} from "./identity-evidence-url-policy";
import {
  identityLifecycleOwnerModeBinding,
  identityLifecycleOwnerModeReady,
  identityPlatformEvidenceBindingStatus,
  identitySecretRotationCadenceBinding,
  identitySecretRotationCadenceReady,
  idpTenantBinding,
  idpTenantBindingReady,
  platformDecisionProductionEvidenceFresh,
  secretStoreReferenceBinding,
  secretStoreReferenceReady
} from "./identity-readiness";
import type { SenaEnterpriseOrganizationDeploymentDecision } from "./ops-deployment-decisions";
import {
  selfManagedIdentityChecklistItems,
  type SenaEnterprisePlatformDecisionEvidenceChecklistItem,
  type SenaEnterprisePlatformDecisionEvidenceChecklistStatus
} from "./ops-platform-decision-policy";
import type { SenaEnterprisePlatformDecisionAcceptance } from "./ops-platform-decisions";

function platformDecisionProductionEvidenceIncludes(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  evidenceId: string
) {
  return Boolean(
    acceptance?.evidenceUrlHash &&
    acceptance.productionEvidenceIds?.includes(evidenceId) &&
    platformDecisionProductionEvidenceFresh(acceptance, evidenceId) &&
    identityPlatformEvidenceBindingStatus(acceptance) !== "stale" &&
    identityEvidenceUrlHostBindingCurrent(acceptance)
  );
}

function idpAcceptedProviderSecretsReady(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  const binding = acceptance?.technicalEvidenceBinding;
  return Boolean(
    binding?.decisionId === "institution-idp-approval" &&
    binding.provider === "institution" &&
    binding.secretBinding?.clientSecretStrength === "configured" &&
    binding.latestPreflightStatus === "pass" &&
    binding.configBinding === "current"
  );
}

function idpAcceptedSecretStoreReferenceReady(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return secretStoreReferenceReady(acceptance?.technicalEvidenceBinding?.secretStoreReferenceBinding);
}

export function idpAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return {
    tenant: platformDecisionProductionEvidenceIncludes(acceptance, "idp-tenant-approval"),
    callback: platformDecisionProductionEvidenceIncludes(acceptance, "idp-callback-approval"),
    providerSecrets: platformDecisionProductionEvidenceIncludes(acceptance, "sso-provider-secrets") && idpAcceptedProviderSecretsReady(acceptance),
    secretStoreReference: platformDecisionProductionEvidenceIncludes(acceptance, "sso-secret-store-reference") && idpAcceptedSecretStoreReferenceReady(acceptance),
    secretRotation: platformDecisionProductionEvidenceIncludes(acceptance, "sso-secret-rotation"),
    evidenceUrl: Boolean(acceptance?.evidenceUrlHash)
  };
}

export function provisioningOwnerAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined) {
  return {
    owner: platformDecisionProductionEvidenceIncludes(acceptance, "provisioning-owner"),
    scimOrIdp: platformDecisionProductionEvidenceIncludes(acceptance, "scim-or-idp-ownership"),
    bearerTokenRotation: platformDecisionProductionEvidenceIncludes(acceptance, "bearer-token-rotation"),
    lifecycleGuardrails: platformDecisionProductionEvidenceIncludes(acceptance, "lifecycle-guardrails"),
    evidenceUrl: Boolean(acceptance?.evidenceUrlHash)
  };
}

export function missingPlatformDecisionAcceptanceEvidence(acceptance: SenaEnterprisePlatformDecisionAcceptance) {
  if (acceptance.status !== "accepted" || !acceptance.acceptedBridge) return [];
  if (acceptance.decisionId === "institution-idp-approval") {
    const evidence = idpAcceptanceEvidence(acceptance);
    return [
      evidence.tenant && evidence.evidenceUrl ? null : "idp-tenant-approval",
      evidence.callback && evidence.evidenceUrl ? null : "idp-callback-approval",
      evidence.providerSecrets && evidence.evidenceUrl ? null : "sso-provider-secrets",
      evidence.secretStoreReference && evidence.evidenceUrl ? null : "sso-secret-store-reference",
      evidence.secretRotation && evidence.evidenceUrl ? null : "sso-secret-rotation"
    ].filter((item): item is string => Boolean(item));
  }
  if (acceptance.decisionId === "institution-provisioning-owner") {
    const evidence = provisioningOwnerAcceptanceEvidence(acceptance);
    return [
      evidence.owner && evidence.evidenceUrl ? null : "provisioning-owner",
      evidence.scimOrIdp && evidence.evidenceUrl ? null : "scim-or-idp-ownership",
      evidence.bearerTokenRotation && evidence.evidenceUrl ? null : "bearer-token-rotation",
      evidence.lifecycleGuardrails && evidence.evidenceUrl ? null : "lifecycle-guardrails"
    ].filter((item): item is string => Boolean(item));
  }
  return [];
}

function platformDecisionChecklistEvidence(entries: string[]) {
  return entries
    .filter((entry) => !/(^|[;|])(secret|password)=[^;|]+/i.test(entry) && !/CLIENT_SECRET/.test(entry))
    .map((entry) => entry.replace(/(^|[;|])token=[^;|]+/gi, "$1token=redacted"));
}

function platformDecisionEvidenceChecklistItem(input: {
  id: string;
  label: string;
  status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
  productionRequired: boolean;
  source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
  evidence: string[];
  nextAction: string;
}): SenaEnterprisePlatformDecisionEvidenceChecklistItem {
  return {
    ...input,
    evidence: platformDecisionChecklistEvidence(input.evidence)
  };
}

function acceptedPlatformChecklistStatus(
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  present: boolean
): SenaEnterprisePlatformDecisionEvidenceChecklistStatus {
  return acceptance?.status === "accepted" && acceptance.acceptedBridge && present ? "accepted" : "missing";
}

function presentPlatformChecklistStatus(present: boolean): SenaEnterprisePlatformDecisionEvidenceChecklistStatus {
  return present ? "present" : "missing";
}

export function platformDecisionEvidenceChecklist(
  decision: SenaEnterpriseOrganizationDeploymentDecision,
  acceptance: SenaEnterprisePlatformDecisionAcceptance | undefined,
  productionBlocking: boolean,
  acceptedBridge: boolean,
  acceptanceCriteria: string[]
): SenaEnterprisePlatformDecisionEvidenceChecklistItem[] {
  if (decision.id === "institution-idp-approval") {
    const evidence = idpAcceptanceEvidence(acceptance);
    const tenantBinding = idpTenantBinding();
    const tenantBindingReady = idpTenantBindingReady(tenantBinding);
    const ssoSecretStoreReference = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
    const ssoSecretStoreReferenceReady = secretStoreReferenceReady(ssoSecretStoreReference);
    const rotationCadence = identitySecretRotationCadenceBinding();
    const rotationCadenceReady = identitySecretRotationCadenceReady(rotationCadence);
    const preflightPassed = decision.evidence.some((entry) =>
      /^institution:configured=true;preflight=pass(;|$)/.test(entry) ||
      /^preflightPassedProviders=(?:.*\|)?institution(?:\||$)/.test(entry)
    );
    return selfManagedIdentityChecklistItems([
      platformDecisionEvidenceChecklistItem({
        id: "idp-tenant-approval",
        label: "Institution IdP tenant approval",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.tenant && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record institution IdP tenant approval with owner evidence URL."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "idp-callback-approval",
        label: "Provider callback and redirect URI approval",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.callback && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `callbackEvidence=${evidence.callback}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Attach provider-side callback or redirect URI approval evidence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-secret-rotation",
        label: "SSO client secret rotation ownership",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.secretRotation && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `secretRotationEvidence=${evidence.secretRotation}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Document the institution-owned SSO secret rotation path before production."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "idp-tenant-binding",
        label: "Runtime IdP tenant identifier binding",
        status: presentPlatformChecklistStatus(tenantBindingReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `tenantBinding=${tenantBinding.configured ? "configured" : "missing"}`,
          `requiredInProduction=${tenantBinding.requiredInProduction}`,
          `tenantHash=${tenantBinding.tenantHash ? "present" : "missing"}`,
          `env=${tenantBinding.env}`
        ],
        nextAction: "Set SENA_SSO_INSTITUTION_TENANT_ID so tenant approval evidence is bound to the institution IdP tenant or app registration."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-secret-rotation-cadence",
        label: "Identity secret rotation cadence configured",
        status: presentPlatformChecklistStatus(rotationCadenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `cadenceDays=${rotationCadence.cadenceDays ?? "missing"}`,
          `valid=${rotationCadence.valid}`,
          `requiredInProduction=${rotationCadence.requiredInProduction}`,
          `minDays=${rotationCadence.minDays}`,
          `maxDays=${rotationCadence.maxDays}`,
          `cadenceHash=${rotationCadence.cadenceHash ? "present" : "missing"}`,
          `env=${rotationCadence.env}`
        ],
        nextAction: "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to the institution-approved SSO/provisioning secret rotation cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-secret-store-reference",
        label: "SSO client secret store reference",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.secretStoreReference && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: [
          ...(acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `secretStoreReferenceEvidence=${evidence.secretStoreReference}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"]),
          `secretStoreReference=${ssoSecretStoreReference.configured ? "configured" : "missing"}`,
          `requiredInProduction=${ssoSecretStoreReference.requiredInProduction}`,
          `referenceHash=${ssoSecretStoreReference.referenceHash ? "present" : "missing"}`,
          `env=${ssoSecretStoreReference.env}`,
          "secretValues=excluded"
        ],
        nextAction: "Record institution secret-store custody evidence for SENA_SSO_INSTITUTION_CLIENT_SECRET_REF before production."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-provider-secrets",
        label: "SSO provider secrets configured",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.providerSecrets && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: [
          ...(acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `providerSecretsEvidence=${evidence.providerSecrets}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"]),
          ...decision.evidence.filter((entry) =>
            /^institution=/.test(entry) ||
            /^institution:configured=/.test(entry)
          )
        ],
        nextAction: "Record institution-owned SSO provider secret custody evidence without exposing secret values."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "sso-preflight",
        label: "SSO provider preflight passed",
        status: presentPlatformChecklistStatus(preflightPassed),
        productionRequired: true,
        source: "technical-readiness",
        evidence: decision.evidence.filter((entry) =>
          /^institution:.*preflight=/.test(entry) ||
          /^preflightPassedProviders=(?:.*\|)?institution(?:\||$)/.test(entry)
        ),
        nextAction: "Run SSO preflight against every enabled provider before release."
      })
    ]);
  }

  if (decision.id === "institution-provisioning-owner") {
    const evidence = provisioningOwnerAcceptanceEvidence(acceptance);
    const rotationCadence = identitySecretRotationCadenceBinding();
    const rotationCadenceReady = identitySecretRotationCadenceReady(rotationCadence);
    const lifecycleOwnerMode = identityLifecycleOwnerModeBinding();
    const lifecycleOwnerModeReady = identityLifecycleOwnerModeReady(lifecycleOwnerMode);
    const provisioningSecretStoreReference = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
    const provisioningSecretStoreReferenceReady = secretStoreReferenceReady(provisioningSecretStoreReference);
    const provisioningTokenConfigured = decision.evidence.some((entry) =>
      /provisioningToken=configured/.test(entry) || /token=configured/.test(entry)
    );
    const provisioningTokenProductionReady = provisioningTokenConfigured && decision.evidence.some((entry) =>
      entry === "provisioningTokenStrength=configured"
    );
    return selfManagedIdentityChecklistItems([
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-owner",
        label: "Institution provisioning owner named",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.owner && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `ownerEvidence=${evidence.owner}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record the institution owner for provisioning lifecycle operations."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "scim-or-idp-ownership",
        label: "SCIM or IdP lifecycle ownership",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.scimOrIdp && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `scimOrIdpEvidence=${evidence.scimOrIdp}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Document whether lifecycle ownership sits with SCIM or the institution IdP."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "bearer-token-rotation",
        label: "Provisioning bearer-token rotation",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.bearerTokenRotation && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `bearerTokenRotationEvidence=${evidence.bearerTokenRotation}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Attach the institution-approved bearer-token rotation owner and cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "lifecycle-guardrails",
        label: "Suspension and last-active-manager guardrails",
        status: acceptedPlatformChecklistStatus(acceptance, evidence.lifecycleGuardrails && evidence.evidenceUrl),
        productionRequired: true,
        source: "platform-acceptance",
        evidence: acceptance ? [`acceptanceStatus=${acceptance.status}`, `acceptedBridge=${acceptance.acceptedBridge}`, `lifecycleGuardrailEvidence=${evidence.lifecycleGuardrails}`, `evidenceUrl=${evidence.evidenceUrl}`] : ["acceptance=missing"],
        nextAction: "Record acceptance of suspension behavior and last-active-manager protection."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-token",
        label: "Provisioning token configured",
        status: presentPlatformChecklistStatus(provisioningTokenProductionReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: decision.evidence.filter((entry) =>
          /^provisioningToken=/.test(entry) ||
          /^token=/.test(entry) ||
          /^provisioningTokenStrength=/.test(entry) ||
          /^provisioningTokenMinLength=/.test(entry)
        ),
        nextAction: "Configure the provisioning bearer token through the secret store."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-secret-rotation-cadence",
        label: "Identity secret rotation cadence configured",
        status: presentPlatformChecklistStatus(rotationCadenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `cadenceDays=${rotationCadence.cadenceDays ?? "missing"}`,
          `valid=${rotationCadence.valid}`,
          `requiredInProduction=${rotationCadence.requiredInProduction}`,
          `minDays=${rotationCadence.minDays}`,
          `maxDays=${rotationCadence.maxDays}`,
          `cadenceHash=${rotationCadence.cadenceHash ? "present" : "missing"}`,
          `env=${rotationCadence.env}`
        ],
        nextAction: "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to the institution-approved SSO/provisioning secret rotation cadence."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "provisioning-secret-store-reference",
        label: "Provisioning token secret store reference",
        status: presentPlatformChecklistStatus(provisioningSecretStoreReferenceReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `secretStoreReference=${provisioningSecretStoreReference.configured ? "configured" : "missing"}`,
          `requiredInProduction=${provisioningSecretStoreReference.requiredInProduction}`,
          `referenceHash=${provisioningSecretStoreReference.referenceHash ? "present" : "missing"}`,
          `env=${provisioningSecretStoreReference.env}`,
          "secretValues=excluded"
        ],
        nextAction: "Set SENA_PROVISIONING_TOKEN_SECRET_REF to the institution secret-store reference for the provisioning bearer token."
      }),
      platformDecisionEvidenceChecklistItem({
        id: "identity-lifecycle-owner-mode",
        label: "SCIM or IdP lifecycle owner mode configured",
        status: presentPlatformChecklistStatus(lifecycleOwnerModeReady),
        productionRequired: true,
        source: "technical-readiness",
        evidence: [
          `mode=${lifecycleOwnerMode.mode ?? "missing"}`,
          `valid=${lifecycleOwnerMode.valid}`,
          `requiredInProduction=${lifecycleOwnerMode.requiredInProduction}`,
          `acceptedModes=${lifecycleOwnerMode.acceptedModes.join("|")}`,
          `env=${lifecycleOwnerMode.env}`
        ],
        nextAction: "Set SENA_IDENTITY_LIFECYCLE_OWNER_MODE to scim, idp, or hybrid so institution lifecycle ownership is explicit."
      })
    ]);
  }

  return acceptanceCriteria.map((criteria, index) => platformDecisionEvidenceChecklistItem({
    id: `${decision.id}-criterion-${index + 1}`,
    label: criteria,
    status: acceptedBridge ? "accepted" : decision.status === "open" ? "missing" : "present",
    productionRequired: productionBlocking,
    source: acceptedBridge ? "platform-acceptance" : "technical-readiness",
    evidence: acceptedBridge ? [`acceptedBridge=${acceptedBridge}`] : decision.evidence,
    nextAction: decision.nextAction
  }));
}
