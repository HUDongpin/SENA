import {
  Download,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  EnterprisePlatformDecisionAcceptance,
  EnterprisePlatformDecisionId,
  EnterprisePlatformDecisionRegister,
  EnterprisePlatformDecisionState,
  EnterprisePlatformDecisionStatus
} from "./enterprise-contracts";
import {
  enterprisePlatformDecisionOptions,
  enterprisePlatformDecisionStatuses
} from "./enterprise-options";

type EnterprisePlatformDecisionHandler = () => unknown | Promise<unknown>;
type PlatformDecision = EnterprisePlatformDecisionRegister["decisions"][number];
type PlatformDecisionEvidenceItem = PlatformDecision["evidenceChecklist"][number];

export type EnterprisePlatformDecisionPanelProps = {
  disabled: boolean;
  enterprisePlatformDecisionState: EnterprisePlatformDecisionState | null;
  selectedPlatformDecision: PlatformDecision | null;
  selectedPlatformDecisionProductionEvidenceItems: PlatformDecisionEvidenceItem[];
  latestPlatformDecisionAcceptance: EnterprisePlatformDecisionAcceptance | null;
  platformDecisionId: EnterprisePlatformDecisionId;
  platformDecisionStatus: EnterprisePlatformDecisionStatus;
  platformDecisionAcceptBridge: boolean;
  platformDecisionOwnerName: string;
  platformDecisionOwnerRole: string;
  platformDecisionEnvironment: string;
  platformDecisionEvidenceUrl: string;
  platformDecisionProductionEvidenceIds: string[];
  platformDecisionProductionEvidenceVerifiedAt: string;
  platformDecisionNotes: string;
  platformDecisionRequiresIdentityEvidenceUrl: boolean;
  platformDecisionRequiresIdentityEvidenceTimestamp: boolean;
  onRefreshPlatformDecisionState: EnterprisePlatformDecisionHandler;
  onExportPlatformDecisionRegisterJson: EnterprisePlatformDecisionHandler;
  onExportNativeAdapterCertificationJson: EnterprisePlatformDecisionHandler;
  onPlatformDecisionIdChange: (value: EnterprisePlatformDecisionId) => void;
  onPlatformDecisionStatusChange: (value: EnterprisePlatformDecisionStatus) => void;
  onPlatformDecisionAcceptBridgeChange: (value: boolean) => void;
  onPlatformDecisionOwnerNameChange: (value: string) => void;
  onPlatformDecisionOwnerRoleChange: (value: string) => void;
  onPlatformDecisionEnvironmentChange: (value: string) => void;
  onPlatformDecisionEvidenceUrlChange: (value: string) => void;
  onPlatformDecisionProductionEvidenceIdsChange: (value: string[]) => void;
  onPlatformDecisionProductionEvidenceVerifiedAtChange: (value: string) => void;
  onPlatformDecisionNotesChange: (value: string) => void;
  onSubmitPlatformDecisionReview: EnterprisePlatformDecisionHandler;
};

export function EnterprisePlatformDecisionPanel({
  disabled,
  enterprisePlatformDecisionState,
  selectedPlatformDecision,
  selectedPlatformDecisionProductionEvidenceItems,
  latestPlatformDecisionAcceptance,
  platformDecisionId,
  platformDecisionStatus,
  platformDecisionAcceptBridge,
  platformDecisionOwnerName,
  platformDecisionOwnerRole,
  platformDecisionEnvironment,
  platformDecisionEvidenceUrl,
  platformDecisionProductionEvidenceIds,
  platformDecisionProductionEvidenceVerifiedAt,
  platformDecisionNotes,
  platformDecisionRequiresIdentityEvidenceUrl,
  platformDecisionRequiresIdentityEvidenceTimestamp,
  onRefreshPlatformDecisionState,
  onExportPlatformDecisionRegisterJson,
  onExportNativeAdapterCertificationJson,
  onPlatformDecisionIdChange,
  onPlatformDecisionStatusChange,
  onPlatformDecisionAcceptBridgeChange,
  onPlatformDecisionOwnerNameChange,
  onPlatformDecisionOwnerRoleChange,
  onPlatformDecisionEnvironmentChange,
  onPlatformDecisionEvidenceUrlChange,
  onPlatformDecisionProductionEvidenceIdsChange,
  onPlatformDecisionProductionEvidenceVerifiedAtChange,
  onPlatformDecisionNotesChange,
  onSubmitPlatformDecisionReview
}: EnterprisePlatformDecisionPanelProps) {
  return (
    <div data-testid="enterprise-platform-decision-review" data-visual-role="enterprise-platform-decision-review" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Platform decisions</div>
          <div data-testid="enterprise-platform-decision-review-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-platform-decision-acceptance/v1
          </div>
          <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-native-adapter-certification/v1
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            {enterprisePlatformDecisionState
              ? `${enterprisePlatformDecisionState.summary.total} records · ${enterprisePlatformDecisionState.summary.acceptedBridge} accepted bridge · ${enterprisePlatformDecisionState.platformDecisionRegister?.summary.acceptedBridgeMissingEvidence ?? 0} missing evidence · ${enterprisePlatformDecisionState.platformDecisionRegister?.summary.productionBlocking ?? 0} blocking decisions`
              : "Sign in as a team manager to load bridge and native-adapter decisions."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onRefreshPlatformDecisionState()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <RotateCcw className="h-4 w-4" /> Decisions
          </button>
          <button type="button" data-testid="enterprise-platform-decision-register-export" onClick={() => void onExportPlatformDecisionRegisterJson()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Download className="h-4 w-4" /> Register JSON
          </button>
          <button type="button" data-testid="enterprise-native-adapter-certification-export" onClick={() => void onExportNativeAdapterCertificationJson()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Download className="h-4 w-4" /> Native adapters
          </button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_11rem_auto]">
        <select
          data-testid="enterprise-platform-decision-select"
          value={platformDecisionId}
          onChange={(event) => onPlatformDecisionIdChange(event.currentTarget.value as EnterprisePlatformDecisionId)}
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        >
          {enterprisePlatformDecisionOptions.map((decision) => (
            <option key={decision.id} value={decision.id}>{decision.label}</option>
          ))}
        </select>
        <select
          data-testid="enterprise-platform-decision-status"
          value={platformDecisionStatus}
          onChange={(event) => onPlatformDecisionStatusChange(event.currentTarget.value as EnterprisePlatformDecisionStatus)}
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        >
          {enterprisePlatformDecisionStatuses.map((status) => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-black uppercase text-muted">
          <input
            type="checkbox"
            checked={platformDecisionAcceptBridge}
            onChange={(event) => onPlatformDecisionAcceptBridgeChange(event.currentTarget.checked)}
            disabled={disabled || platformDecisionStatus !== "accepted"}
            className="h-4 w-4 accent-cyanGlow"
          />
          Bridge
        </label>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <input data-testid="enterprise-platform-decision-owner" value={platformDecisionOwnerName} onChange={(event) => onPlatformDecisionOwnerNameChange(event.currentTarget.value)} placeholder="Named institution platform owner" disabled={disabled} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
        <input value={platformDecisionOwnerRole} onChange={(event) => onPlatformDecisionOwnerRoleChange(event.currentTarget.value)} placeholder="Owner role" disabled={disabled} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
        <input value={platformDecisionEnvironment} onChange={(event) => onPlatformDecisionEnvironmentChange(event.currentTarget.value)} placeholder="Environment" disabled={disabled} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input data-testid="enterprise-platform-decision-evidence" value={platformDecisionEvidenceUrl} onChange={(event) => onPlatformDecisionEvidenceUrlChange(event.currentTarget.value)} placeholder="Institution HTTPS evidence URL" required={platformDecisionRequiresIdentityEvidenceUrl} disabled={disabled} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
        <input data-testid="enterprise-platform-decision-production-evidence-verified-at" type="datetime-local" aria-label="Production evidence verified at" title="Institution production evidence verified-at timestamp" required={platformDecisionRequiresIdentityEvidenceTimestamp} value={platformDecisionProductionEvidenceVerifiedAt} onChange={(event) => onPlatformDecisionProductionEvidenceVerifiedAtChange(event.currentTarget.value)} disabled={disabled} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
        <button data-testid="enterprise-platform-decision-submit" type="button" onClick={() => void onSubmitPlatformDecisionReview()} disabled={disabled || !platformDecisionOwnerName.trim() || !platformDecisionNotes.trim()} className={buttonStyles({ variant: "dark", size: "sm" })}>
          <ShieldCheck className="h-4 w-4" /> Record
        </button>
      </div>
      <div data-testid="enterprise-platform-decision-production-evidence" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
        <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">Production evidence covered by this decision</div>
        {selectedPlatformDecisionProductionEvidenceItems.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedPlatformDecisionProductionEvidenceItems.map((item) => {
              const checked = platformDecisionProductionEvidenceIds.includes(item.id);
              return (
                <label key={item.id} className="flex min-w-0 items-start gap-2 rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 text-xs font-semibold leading-5 text-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onPlatformDecisionProductionEvidenceIdsChange(event.currentTarget.checked
                      ? Array.from(new Set([...platformDecisionProductionEvidenceIds, item.id]))
                      : platformDecisionProductionEvidenceIds.filter((id) => id !== item.id))}
                    disabled={disabled || platformDecisionStatus !== "accepted"}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyanGlow"
                  />
                  <span className="min-w-0">{item.label}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 text-xs font-semibold leading-5 text-muted">
            No production evidence checklist for this decision.
          </div>
        )}
      </div>
      <textarea value={platformDecisionNotes} onChange={(event) => onPlatformDecisionNotesChange(event.currentTarget.value)} placeholder="Decision notes" disabled={disabled} className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50" />
      <div className="grid gap-2 text-xs font-semibold leading-5 text-muted">
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
          Selected: {selectedPlatformDecision ? `${selectedPlatformDecision.label} · ${selectedPlatformDecision.status} · accepted bridge ${selectedPlatformDecision.acceptedBridge ? "yes" : "no"}` : "Load decisions to inspect the current register."}
        </div>
        {selectedPlatformDecision?.evidenceChecklist?.length ? (
          <div data-testid="enterprise-platform-decision-evidence-checklist" className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
            {selectedPlatformDecision.evidenceChecklist.map((item) => (
              <div key={item.id} className="grid min-w-0 gap-1 rounded-md border border-cardBorder/25 bg-background/25 px-2 py-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0 truncate text-[0.72rem] font-black text-foreground">{item.label}</span>
                <span className={cn(
                  "w-fit rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase",
                  item.status === "accepted" ? "bg-emerald-500/15 text-emerald-700" : item.status === "present" ? "bg-cyanGlow/15 text-cyanGlow" : "bg-amber-500/15 text-amber-800"
                )}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {latestPlatformDecisionAcceptance ? (
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
            Latest: {latestPlatformDecisionAcceptance.decisionId} · {latestPlatformDecisionAcceptance.status} · {latestPlatformDecisionAcceptance.ownerRole} · {new Date(latestPlatformDecisionAcceptance.updatedAt).toLocaleString()}
          </div>
        ) : (
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2">
            No platform decision acceptance records loaded for this team.
          </div>
        )}
      </div>
    </div>
  );
}
