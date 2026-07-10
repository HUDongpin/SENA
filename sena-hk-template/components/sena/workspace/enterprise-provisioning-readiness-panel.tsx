import {
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { SENA_WORKSPACE_API_ROUTES } from "./api-client";
import type {
  EnterpriseDeploymentEnv,
  EnterpriseDeploymentPlatformDecision,
  EnterpriseDeploymentServiceEndpoint,
  EnterpriseIdentityInstitutionActionPlan,
  EnterpriseIdentityPlatformDecisionRequestPacket,
  EnterpriseIdentityProductionEvidenceDossier,
  EnterpriseOrganizationDeploymentPackage
} from "./enterprise-contracts";

type EnterpriseIdentityRequest = EnterpriseIdentityPlatformDecisionRequestPacket["requests"][number];
type EnterpriseGovernanceCheck = EnterpriseOrganizationDeploymentPackage["governance"]["keyChecks"][number];

export type EnterpriseProvisioningReadinessPanelProps = {
  disabled: boolean;
  enterpriseDeploymentPackage: EnterpriseOrganizationDeploymentPackage | null;
  identityProductionHandoff: EnterpriseIdentityProductionEvidenceDossier | null;
  platformRequestPacket: EnterpriseIdentityPlatformDecisionRequestPacket | null;
  institutionActionPlan: EnterpriseIdentityInstitutionActionPlan | null;
  identityCutoverChecklist: EnterpriseIdentityProductionEvidenceDossier["cutoverChecklist"] | null;
  provisioningDeploymentEnv: EnterpriseDeploymentEnv[];
  provisioningServiceEndpoints: EnterpriseDeploymentServiceEndpoint[];
  identityProductionServiceEndpoint: EnterpriseDeploymentServiceEndpoint | null;
  provisioningOwnerDecision: EnterpriseDeploymentPlatformDecision | null;
  provisioningGovernanceCheck: EnterpriseGovernanceCheck | null;
  onRefreshProvisioningReadiness: () => unknown | Promise<unknown>;
  onApplyIdentityRequestToPlatformDecision: (request: EnterpriseIdentityRequest) => unknown | Promise<unknown>;
};

const fallbackProvisioningEndpoints: EnterpriseDeploymentServiceEndpoint[] = [
  {
    id: "provisioning",
    method: "POST",
    path: SENA_WORKSPACE_API_ROUTES.enterprise.provisioning,
    auth: "provisioning-bearer",
    schema: "sena-enterprise-provisioning/v1",
    purpose: "Institution organization provisioning"
  },
  {
    id: "scim-users",
    method: "POST",
    path: SENA_WORKSPACE_API_ROUTES.enterprise.scimUsers,
    auth: "provisioning-bearer",
    schema: "sena-scim-provisioning-bridge/v1",
    purpose: "SCIM user provisioning bridge"
  }
];

const fallbackProvisioningEnv: EnterpriseDeploymentEnv[] = [
  {
    name: "SENA_PROVISIONING_TOKEN",
    category: "provisioning",
    required: false,
    configured: false,
    secret: true,
    status: "review",
    purpose: "Bearer token for institution IdP/SCIM provisioning"
  },
  {
    name: "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS",
    category: "identity",
    required: false,
    configured: false,
    secret: false,
    status: "review",
    purpose: "Institution evidence-host allowlist for IdP/SCIM production evidence URLs"
  }
];

export function EnterpriseProvisioningReadinessPanel({
  disabled,
  enterpriseDeploymentPackage,
  identityProductionHandoff,
  platformRequestPacket,
  institutionActionPlan,
  identityCutoverChecklist,
  provisioningDeploymentEnv,
  provisioningServiceEndpoints,
  identityProductionServiceEndpoint,
  provisioningOwnerDecision,
  provisioningGovernanceCheck,
  onRefreshProvisioningReadiness,
  onApplyIdentityRequestToPlatformDecision
}: EnterpriseProvisioningReadinessPanelProps) {
  const configuredProvisioningEnvCount = provisioningDeploymentEnv.filter((entry) => entry.configured).length;
  const endpointCount = provisioningServiceEndpoints.length + (identityProductionServiceEndpoint ? 1 : 0);
  const visibleEndpoints = provisioningServiceEndpoints.length > 0 ? provisioningServiceEndpoints : fallbackProvisioningEndpoints;
  const visibleEnv = provisioningDeploymentEnv.length > 0 ? provisioningDeploymentEnv : fallbackProvisioningEnv;

  return (
    <div data-testid="enterprise-provisioning-readiness" data-visual-role="enterprise-provisioning-scim-readiness" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Provisioning / SCIM</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            {enterpriseDeploymentPackage
              ? `${enterpriseDeploymentPackage.status} · identity ${enterpriseDeploymentPackage.summary.identityProductionStatus} · verifier ${enterpriseDeploymentPackage.summary.identitySubmissionVerifierIncomplete} incomplete · rotation ${enterpriseDeploymentPackage.summary.identityRotationFreshness} · handoff ${identityProductionHandoff ? `${identityProductionHandoff.platformRequestPacket.summary.blockingRequests} blockers / ${identityProductionHandoff.evidenceManifest.missingEvidenceIds.length} missing · action ${identityProductionHandoff.institutionActionPlan.summary.blockingLanes} lane blockers` : "pending"} · ${configuredProvisioningEnvCount}/${provisioningDeploymentEnv.length} env · ${endpointCount} endpoints · sena-enterprise-organization-deployment/v1`
              : "Institution lifecycle bridge · sena-enterprise-organization-deployment/v1"}
          </div>
          <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-provisioning/v1 · sena-scim-provisioning-bridge/v1 · sena-enterprise-identity-production-evidence/v1
          </div>
        </div>
        <button
          type="button"
          data-testid="enterprise-provisioning-readiness-refresh"
          onClick={() => void onRefreshProvisioningReadiness()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <RotateCcw className="h-4 w-4" /> Provisioning
        </button>
      </div>
      {platformRequestPacket && (
        <div data-testid="enterprise-identity-request-packet-summary" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold leading-5 text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-black uppercase text-foreground">Identity request packet</span>
            <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
              {platformRequestPacket.schemaVersion}
            </span>
          </div>
          <div>
            {platformRequestPacket.submission.method} {platformRequestPacket.submission.path} · {platformRequestPacket.summary.blockingRequests} blocking · {platformRequestPacket.summary.missingProductionEvidence} missing evidence · {platformRequestPacket.summary.missingTechnicalPrerequisites} technical · {platformRequestPacket.summary.receiptReviewRequests} receipt review
          </div>
          <div className="truncate">
            Body {platformRequestPacket.submission.requiredBodyFields.join(", ")}
          </div>
          <div className="truncate">
            Identity evidence fields {platformRequestPacket.submission.identityProductionEvidenceBodyFields.join(", ")}
          </div>
          <div data-testid="enterprise-identity-request-policy-binding" className="truncate">
            Request policy {platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyHash="))?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing"} · {platformRequestPacket.evidence.find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing"}
          </div>
          <div data-testid="enterprise-identity-submission-verifier-policy-binding" className="truncate">
            Verifier policy {identityProductionHandoff?.submissionVerifier.evidence.find((entry) => entry.startsWith("requestPacketPolicyHash="))?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing"} · {identityProductionHandoff?.submissionVerifier.evidence.find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing"}
          </div>
          <div data-testid="enterprise-identity-request-evidence-url-policy" className="truncate">
            Evidence URL {platformRequestPacket.submission.evidenceUrlPolicy.requiredProtocol} · required IDs {platformRequestPacket.submission.evidenceUrlPolicy.evidenceUrlRequiredForEvidenceIds.length} · allowed hosts {platformRequestPacket.submission.evidenceUrlPolicy.allowedHostConfigStatus ?? "not-configured"} ({platformRequestPacket.submission.evidenceUrlPolicy.allowedHostCount ?? 0}, invalid {platformRequestPacket.submission.evidenceUrlPolicy.invalidAllowedHostCount ?? 0}) · app origin {platformRequestPacket.submission.evidenceUrlPolicy.senaAppOriginConfigured ? "bound" : "missing"}
          </div>
          <div data-testid="enterprise-identity-request-evidence-url-secret-carriers" className="truncate">
            Evidence URL secret carriers {platformRequestPacket.submission.evidenceUrlPolicy.embeddedCredentialsRejected ? "embedded credentials rejected" : "embedded credentials allowed"} · {platformRequestPacket.submission.evidenceUrlPolicy.fragmentsRejected ? "fragments rejected" : "fragments allowed"} · {platformRequestPacket.submission.evidenceUrlPolicy.sensitiveQueryParametersRejected ? "sensitive query rejected" : "sensitive query allowed"} · rejected query {platformRequestPacket.submission.evidenceUrlPolicy.rejectedSensitiveQueryParameters.join(", ") || "none"}
          </div>
          <div data-testid="enterprise-identity-request-secret-policy" className="truncate">
            Submission secrets {platformRequestPacket.submission.notesPolicy.secretValuesRejected ? "raw secrets rejected" : "raw secrets allowed"} · {platformRequestPacket.submission.notesPolicy.bearerTokensRejected ? "bearer tokens rejected" : "bearer tokens allowed"} · fields {platformRequestPacket.submission.freeTextPolicy.fields.join(", ")} · sensitive names {platformRequestPacket.submission.notesPolicy.rejectedSensitiveAssignmentNames.length}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {platformRequestPacket.requests.map((request) => (
              <div key={request.decisionId} data-testid="enterprise-identity-request-packet-decision" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-foreground">{request.label}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", request.blocking ? "border-amber-400/45 bg-amber-400/10 text-amber-800" : "border-emerald-400/45 bg-emerald-400/10 text-emerald-700")}>
                      {request.blocking ? "blocking" : "ready"}
                    </span>
                    <button
                      type="button"
                      data-testid="enterprise-identity-request-apply"
                      onClick={() => void onApplyIdentityRequestToPlatformDecision(request)}
                      disabled={disabled}
                      className={buttonStyles({ variant: "secondary", size: "sm" })}
                    >
                      <ShieldCheck className="h-4 w-4" /> Apply
                    </button>
                  </div>
                </div>
                <div className="truncate">
                  {request.decisionId} · evidence {request.submissionTemplate.productionEvidenceIds.join(", ") || "none"} · verifiedAt {request.submissionTemplate.productionEvidenceVerifiedAtField}
                </div>
                <div className="truncate">
                  owner {request.submissionTemplate.ownerNamePolicy.specificInstitutionOwnerRequired ? "named institution owner required" : request.submissionTemplate.ownerNamePlaceholder} · placeholder {request.submissionTemplate.ownerNamePolicy.genericPlaceholderRejected ? "rejected" : "allowed"}
                </div>
                <div data-testid="enterprise-identity-request-owner-role-policy" className="truncate">
                  role policy forbid {platformRequestPacket.submission.ownerRolePolicy.forbiddenTokens.join(", ") || "none"} · institution {platformRequestPacket.submission.ownerRolePolicy.institutionOwnerTokens.join(", ")} · decision tokens {platformRequestPacket.submission.ownerRolePolicy.requiredSemanticTokensByDecision[request.decisionId].join(", ")}
                </div>
                <div className="truncate">
                  verifiedAt {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.validPastOrPresentRequired ? "past/current required" : "optional"} · {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.canonicalIsoTimestampRequired ? "canonical ISO required" : "noncanonical allowed"} · future {request.submissionTemplate.productionEvidenceVerifiedAtPolicy.futureTimestampsRejected ? "rejected" : "allowed"}
                </div>
                <div className="truncate">
                  rotation {request.submissionTemplate.rotationFreshnessPolicy.rotationEvidenceIds.join(", ") || "none"} · max {request.submissionTemplate.rotationFreshnessPolicy.maxAgeDays}d · warn {request.submissionTemplate.rotationFreshnessPolicy.warningDays}d
                </div>
                <div className="truncate">
                  missing {request.missingProductionEvidenceIds.length} · technical {request.missingTechnicalPrerequisiteEvidenceIds.length} · receipt {request.latestReceiptVerifierStatus ?? "pending"} · host {request.latestReceiptEvidenceUrlHostBindingStatus ?? "pending"}
                </div>
                <div data-testid="enterprise-identity-request-host-binding" className="truncate">
                  evidence host binding {request.latestReceiptEvidenceUrlHostBindingStatus ?? "pending"} · receipt {request.latestReceiptVerifierStatus ?? "pending"}
                </div>
                <div data-testid="enterprise-identity-request-receipt-policy-binding" className="truncate">
                  request policy binding {request.latestReceiptRequestPacketPolicyBindingStatus ?? "pending"} · receipt {request.latestReceiptVerifierStatus ?? "pending"}
                </div>
                <div data-testid="enterprise-identity-request-rotation-receipt" className="truncate">
                  receipt rotation {request.latestReceiptRotationFreshnessStatus ?? "pending"} · expired {(request.latestReceiptRotationExpiredEvidenceIds ?? []).join(", ") || "none"} · due soon {(request.latestReceiptRotationDueSoonEvidenceIds ?? []).join(", ") || "none"}
                </div>
                <div data-testid="enterprise-identity-request-next-actions" className="truncate">
                  next {request.nextActions.join(" · ")}
                </div>
                <div data-testid="enterprise-identity-request-acceptance-criteria" className="truncate">
                  criteria {request.acceptanceCriteria.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {institutionActionPlan && (
        <div data-testid="enterprise-identity-institution-action-plan" className="grid gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 p-2 text-xs font-semibold leading-5 text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-black uppercase text-foreground">Institution action plan</span>
            <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-violet-700">
              {institutionActionPlan.schemaVersion}
            </span>
          </div>
          <div>
            {institutionActionPlan.status} · {institutionActionPlan.summary.blockingLanes}/{institutionActionPlan.summary.lanes} blocking lanes · {institutionActionPlan.summary.missingProductionEvidence} missing evidence · {institutionActionPlan.summary.missingTechnicalPrerequisites} technical · digest {institutionActionPlan.digest?.slice(0, 12) ?? "missing"}
          </div>
          <div data-testid="enterprise-identity-action-plan-redaction" className="truncate">
            redaction secrets {institutionActionPlan.redaction.secretValuesExcluded ? "excluded" : "included"} · evidence URLs {institutionActionPlan.redaction.evidenceUrlValuesExcluded ? "field only" : "included"} · owner names {institutionActionPlan.redaction.ownerNamesExcluded ? "excluded" : "included"} · evidence field {institutionActionPlan.redaction.submissionDraftEvidenceUrlFieldOnly ? "evidenceUrlField" : "evidenceUrl"}
          </div>
          <div data-testid="enterprise-identity-action-plan-archive" className="truncate">
            archive path {institutionActionPlan.summary.submissionPath} · receipt body paths {institutionActionPlan.lanes[0]?.receiptArchiveBodyPaths.join(", ") ?? "missing"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {institutionActionPlan.lanes.map((lane) => (
              <div key={lane.id} data-testid="enterprise-identity-institution-action-plan-lane" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-foreground">{lane.ownerRole}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", lane.blocking ? "border-amber-400/45 bg-amber-400/10 text-amber-800" : "border-emerald-400/45 bg-emerald-400/10 text-emerald-700")}>
                    {lane.status}
                  </span>
                </div>
                <div className="truncate">
                  {lane.id} · decisions {lane.decisionIds.join(", ")} · drafts {lane.submissionDrafts.length}
                </div>
                <div className="truncate">
                  missing {lane.missingProductionEvidenceIds.join(", ") || "none"}
                </div>
                <div className="truncate">
                  technical {lane.missingTechnicalPrerequisiteEvidenceIds.join(", ") || "none"} · rotation {lane.rotationEvidenceIds.join(", ") || "none"}
                </div>
                <div className="truncate">
                  archive {lane.receiptArchiveStatuses.join(", ") || "pending"} · artifact {lane.artifactCompletenessStatuses.join(", ") || "pending"}
                </div>
                <div className="truncate">
                  headers {lane.responseAuditHeaders.slice(0, 3).join(", ")} · paths {lane.receiptArchiveBodyPaths.join(", ")}
                </div>
                <div className="line-clamp-2">
                  next {lane.nextActions.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {identityCutoverChecklist && (
        <div data-testid="enterprise-identity-cutover-checklist" className="grid gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs font-semibold leading-5 text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-black uppercase text-foreground">Identity cutover checklist</span>
            <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-amber-700">
              {identityCutoverChecklist.schemaVersion}
            </span>
          </div>
          <div>
            {identityCutoverChecklist.status} · {identityCutoverChecklist.summary.readyItems}/{identityCutoverChecklist.summary.items} ready · {identityCutoverChecklist.summary.blockingItems} blockers
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {identityCutoverChecklist.items.map((item) => (
              <div key={item.id} data-testid="enterprise-identity-cutover-checklist-item" className="grid gap-1 rounded-md border border-cardBorder/30 bg-background/35 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-foreground">{item.label}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", item.status === "ready" ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-800")}>
                    {item.status}
                  </span>
                </div>
                <div className="truncate">
                  {item.id} · evidence {item.evidenceIds.join(", ")}
                </div>
                <div className="truncate">
                  missing {item.missingEvidenceIds.join(", ") || "none"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2">
        {visibleEndpoints.slice(0, 3).map((endpoint) => (
          <div key={endpoint.id} data-testid="enterprise-provisioning-endpoint" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="truncate font-black text-foreground">
                {endpoint.method} {endpoint.path}
              </div>
              <div className="truncate">
                {endpoint.auth} · {endpoint.schema ?? "schema pending"} · {endpoint.purpose}
              </div>
            </div>
            <span className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">
              {endpoint.id}
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleEnv.map((entry) => (
          <div key={entry.name} data-testid="enterprise-provisioning-env" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-black text-foreground">{entry.name}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", entry.configured ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-700")}>
                {entry.configured ? "configured" : "missing"}
              </span>
            </div>
            <div className="truncate">
              {entry.secret ? "secret excluded" : entry.valueHash ? `valueHash ${entry.valueHash.slice(0, 12)}` : "non-secret"}
            </div>
            <div className="truncate">{entry.purpose}</div>
          </div>
        ))}
      </div>
      <div data-testid="enterprise-provisioning-owner-decision" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-black text-foreground">
            {provisioningOwnerDecision?.label ?? "Institution provisioning owner"}
          </span>
          <span className="rounded-full border border-cardBorder/40 bg-background/50 px-2 py-0.5 text-[0.65rem] font-black uppercase text-muted">
            {provisioningOwnerDecision?.status ?? "open"}
          </span>
        </div>
        <div className="truncate">
          institution-provisioning-owner · {provisioningGovernanceCheck?.status ?? "review"} · register {enterpriseDeploymentPackage?.platformDecisionRegister.schemaVersion ?? SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister}
        </div>
        <div className="line-clamp-2">
          {provisioningOwnerDecision?.nextAction ?? "Assign the institution provisioning owner and configure SENA_PROVISIONING_TOKEN before claiming institution-managed lifecycle sync."}
        </div>
      </div>
    </div>
  );
}
