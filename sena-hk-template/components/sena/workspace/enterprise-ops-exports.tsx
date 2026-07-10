import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";

type EnterpriseOpsExportHandler = () => void | Promise<void>;

export type EnterpriseOpsExportsProps = {
  disabled: boolean;
  canSubmitAttestation: boolean;
  onExportOpsStatusJson: EnterpriseOpsExportHandler;
  onExportOpsReadinessJson: EnterpriseOpsExportHandler;
  onExportDeploymentPackageJson: EnterpriseOpsExportHandler;
  onExportCapabilityAuditJson: EnterpriseOpsExportHandler;
  onExportIdentityProductionEvidenceJson: EnterpriseOpsExportHandler;
  onExportSaasOperationsReadinessJson: EnterpriseOpsExportHandler;
  onExportGoLiveRehearsalJson: EnterpriseOpsExportHandler;
  onExportGoLiveRollbackDrillJson: EnterpriseOpsExportHandler;
  onExportGoLiveMonitorJson: EnterpriseOpsExportHandler;
  onApplyGoLiveRehearsalDraft: EnterpriseOpsExportHandler;
  onSubmitGoLiveAttestation: EnterpriseOpsExportHandler;
  onExportGoLiveAttestationsJson: EnterpriseOpsExportHandler;
  onExportReleaseGateReviewsJson: EnterpriseOpsExportHandler;
  onExportOpsAlertsJson: EnterpriseOpsExportHandler;
  onDeliverOpsAlerts: EnterpriseOpsExportHandler;
};

export function EnterpriseOpsExports({
  disabled,
  canSubmitAttestation,
  onExportOpsStatusJson,
  onExportOpsReadinessJson,
  onExportDeploymentPackageJson,
  onExportCapabilityAuditJson,
  onExportIdentityProductionEvidenceJson,
  onExportSaasOperationsReadinessJson,
  onExportGoLiveRehearsalJson,
  onExportGoLiveRollbackDrillJson,
  onExportGoLiveMonitorJson,
  onApplyGoLiveRehearsalDraft,
  onSubmitGoLiveAttestation,
  onExportGoLiveAttestationsJson,
  onExportReleaseGateReviewsJson,
  onExportOpsAlertsJson,
  onDeliverOpsAlerts
}: EnterpriseOpsExportsProps) {
  return (
    <div data-testid="enterprise-ops-exports" data-visual-role="enterprise-ops-artifact-exports" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Ops exports</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            status · readiness · deployment package · SaaS operations · go-live rehearsal · firing alerts · sena-enterprise-ops-alert-delivery/v1
          </div>
          <div data-testid="enterprise-saas-operations-readiness-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-saas-operations-readiness/v1
          </div>
          <div data-testid="enterprise-capability-audit-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-capability-audit/v1
          </div>
          <div data-testid="enterprise-identity-production-evidence-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-production-evidence/v1
          </div>
          <div data-testid="enterprise-identity-platform-decision-request-packet-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-platform-decision-request-packet/v1
          </div>
          <div data-testid="enterprise-identity-submission-verifier-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-submission-verifier/v1
          </div>
          <div data-testid="enterprise-identity-rotation-freshness-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-rotation-freshness/v1
          </div>
          <div data-testid="enterprise-identity-cutover-checklist-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-cutover-checklist/v1
          </div>
          <div data-testid="enterprise-go-live-rehearsal-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-go-live-rehearsal/v1
          </div>
          <div data-testid="enterprise-go-live-rollback-drill-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-go-live-rollback-drill/v1
          </div>
          <div data-testid="enterprise-go-live-monitor-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-go-live-monitor/v1
          </div>
          <div data-testid="enterprise-go-live-release-gate-draft-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-release-gate-draft/v1
          </div>
          <div data-testid="enterprise-go-live-attestation-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-go-live-attestation/v1
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          data-testid="enterprise-ops-status-export"
          onClick={() => void onExportOpsStatusJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Activity className="h-4 w-4" /> Status JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-ops-readiness-export"
          onClick={() => void onExportOpsReadinessJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <CheckCircle2 className="h-4 w-4" /> Readiness JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-ops-deployment-export"
          onClick={() => void onExportDeploymentPackageJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Database className="h-4 w-4" /> Deployment JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-capability-audit-export"
          onClick={() => void onExportCapabilityAuditJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <FileText className="h-4 w-4" /> Capability audit
        </button>
        <button
          type="button"
          data-testid="enterprise-identity-production-evidence-export"
          onClick={() => void onExportIdentityProductionEvidenceJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> Identity evidence
        </button>
        <button
          type="button"
          data-testid="enterprise-saas-operations-readiness-export"
          onClick={() => void onExportSaasOperationsReadinessJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> SaaS ops JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-rehearsal-export"
          onClick={() => void onExportGoLiveRehearsalJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <CheckCircle2 className="h-4 w-4" /> Go-live JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-rollback-drill-export"
          onClick={() => void onExportGoLiveRollbackDrillJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <AlertTriangle className="h-4 w-4" /> Rollback drill
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-monitor-export"
          onClick={() => void onExportGoLiveMonitorJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Activity className="h-4 w-4" /> Monitor JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-rehearsal-apply-draft"
          onClick={() => void onApplyGoLiveRehearsalDraft()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> Apply draft
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-attestation-submit"
          onClick={() => void onSubmitGoLiveAttestation()}
          disabled={disabled || !canSubmitAttestation}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> Attest
        </button>
        <button
          type="button"
          data-testid="enterprise-go-live-attestation-export"
          onClick={() => void onExportGoLiveAttestationsJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Download className="h-4 w-4" /> Attest JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-ops-release-gate-export"
          onClick={() => void onExportReleaseGateReviewsJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> Release gate JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-ops-alerts-export"
          onClick={() => void onExportOpsAlertsJson()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <AlertTriangle className="h-4 w-4" /> Alerts JSON
        </button>
        <button
          type="button"
          data-testid="enterprise-ops-alert-delivery"
          onClick={() => void onDeliverOpsAlerts()}
          disabled={disabled}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Activity className="h-4 w-4" /> Alert delivery
        </button>
      </div>
    </div>
  );
}
