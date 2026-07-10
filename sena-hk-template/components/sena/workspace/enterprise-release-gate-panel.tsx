import {
  Download,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseGateReview,
  EnterpriseReleaseGateState,
  EnterpriseReleaseVerificationStatus
} from "./enterprise-contracts";
import { enterpriseReleaseGateDecisions } from "./enterprise-options";

type EnterpriseReleaseGateHandler = () => unknown | Promise<unknown>;

export type EnterpriseReleaseGatePanelProps = {
  disabled: boolean;
  canSubmitReview: boolean;
  enterpriseReleaseGateState: EnterpriseReleaseGateState | null;
  latestReleaseGateReview: EnterpriseReleaseGateReview | null;
  latestReleaseGateIdentitySnapshot?: EnterpriseReleaseGateReview["identityProductionSnapshot"];
  platformBlockers: number;
  releaseGateDecision: EnterpriseReleaseGateDecision;
  releaseGateVersion: string;
  releaseGateEnvironment: string;
  releaseGateApproverName: string;
  releaseGateApproverRole: string;
  releaseGateNotes: string;
  releaseGateVerificationStatus: EnterpriseReleaseVerificationStatus;
  releaseGateVerificationSummary: string;
  releaseGateVerificationHash: string;
  onReleaseGateDecisionChange: (value: EnterpriseReleaseGateDecision) => void;
  onReleaseGateVersionChange: (value: string) => void;
  onReleaseGateEnvironmentChange: (value: string) => void;
  onReleaseGateApproverNameChange: (value: string) => void;
  onReleaseGateApproverRoleChange: (value: string) => void;
  onReleaseGateNotesChange: (value: string) => void;
  onReleaseGateVerificationStatusChange: (value: EnterpriseReleaseVerificationStatus) => void;
  onReleaseGateVerificationSummaryChange: (value: string) => void;
  onReleaseGateVerificationHashChange: (value: string) => void;
  onRefreshReleaseGateReviews: EnterpriseReleaseGateHandler;
  onExportReleaseGateReviewsJson: EnterpriseReleaseGateHandler;
  onSubmitReleaseGateReview: EnterpriseReleaseGateHandler;
};

function ReleaseGateMetricCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-cardBorder/35 bg-background/40 px-3 py-2">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

export function EnterpriseReleaseGatePanel({
  disabled,
  canSubmitReview,
  enterpriseReleaseGateState,
  latestReleaseGateReview,
  latestReleaseGateIdentitySnapshot,
  platformBlockers,
  releaseGateDecision,
  releaseGateVersion,
  releaseGateEnvironment,
  releaseGateApproverName,
  releaseGateApproverRole,
  releaseGateNotes,
  releaseGateVerificationStatus,
  releaseGateVerificationSummary,
  releaseGateVerificationHash,
  onReleaseGateDecisionChange,
  onReleaseGateVersionChange,
  onReleaseGateEnvironmentChange,
  onReleaseGateApproverNameChange,
  onReleaseGateApproverRoleChange,
  onReleaseGateNotesChange,
  onReleaseGateVerificationStatusChange,
  onReleaseGateVerificationSummaryChange,
  onReleaseGateVerificationHashChange,
  onRefreshReleaseGateReviews,
  onExportReleaseGateReviewsJson,
  onSubmitReleaseGateReview
}: EnterpriseReleaseGatePanelProps) {
  const requestPacketPolicyHash = latestReleaseGateIdentitySnapshot?.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyHash="))
    ?.slice("requestPacketPolicyHash=".length, "requestPacketPolicyHash=".length + 12) ?? "missing";
  const requestPacketPolicyBinding = latestReleaseGateIdentitySnapshot?.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyBinding=")) ?? "requestPacketPolicyBinding=missing";

  return (
    <div data-testid="enterprise-release-gate-review" data-visual-role="enterprise-release-gate-review" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Release gate</div>
          <div data-testid="enterprise-release-gate-review-schema" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-release-gate-review/v1
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            {enterpriseReleaseGateState
              ? `${enterpriseReleaseGateState.summary.total} review${enterpriseReleaseGateState.summary.total === 1 ? "" : "s"} · latest ${enterpriseReleaseGateState.summary.latestStatus ?? "none"}`
              : "Record a release decision after readiness, platform decisions, and verification are reviewed."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onRefreshReleaseGateReviews()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <RotateCcw className="h-4 w-4" /> Gate
          </button>
          <button
            type="button"
            data-testid="enterprise-release-gate-export"
            onClick={() => void onExportReleaseGateReviewsJson()}
            disabled={disabled}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            <Download className="h-4 w-4" /> Gate JSON
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ReleaseGateMetricCell label="Approved" value={enterpriseReleaseGateState?.summary.approved ?? 0} />
        <ReleaseGateMetricCell label="Conditional" value={enterpriseReleaseGateState?.summary.conditional ?? 0} />
        <ReleaseGateMetricCell label="Blocked" value={enterpriseReleaseGateState?.summary.blocked ?? 0} />
        <ReleaseGateMetricCell label="Platform blockers" value={latestReleaseGateReview?.platformDecisionSnapshot.productionBlocking ?? platformBlockers} />
        <ReleaseGateMetricCell label="Identity missing" value={latestReleaseGateIdentitySnapshot?.missingEvidenceIds.length ?? 0} />
      </div>
      <div data-testid="enterprise-release-gate-identity-snapshot" className="grid gap-2 border-t border-cardBorder/35 pt-3 text-xs font-semibold leading-5 text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black uppercase text-foreground">Identity snapshot</span>
          <span data-testid="enterprise-release-gate-identity-snapshot-schema" className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-enterprise-identity-production-evidence/v1
          </span>
          <span className={cn(
            "rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase",
            latestReleaseGateIdentitySnapshot?.status === "ready" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800"
          )}>
            {latestReleaseGateIdentitySnapshot?.status ?? "missing"}
          </span>
        </div>
        <div>
          Missing {latestReleaseGateIdentitySnapshot?.missingEvidenceIds.length ?? 0} · verifier missing {latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? 0} · rotation {latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"} · blocked {latestReleaseGateIdentitySnapshot?.releaseGateBlocked ? "yes" : "no"}
        </div>
        <div data-testid="enterprise-release-gate-identity-policy-binding" className="truncate">
          Identity policy {requestPacketPolicyHash} · {requestPacketPolicyBinding}
        </div>
        <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">
          sena-enterprise-identity-submission-verifier/v1 · sena-enterprise-identity-rotation-freshness/v1
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
        <select
          data-testid="enterprise-release-gate-decision"
          value={releaseGateDecision}
          onChange={(event) => onReleaseGateDecisionChange(event.currentTarget.value as EnterpriseReleaseGateDecision)}
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        >
          {enterpriseReleaseGateDecisions.map((decision) => (
            <option key={decision.value} value={decision.value}>{decision.label}</option>
          ))}
        </select>
        <input
          value={releaseGateVersion}
          onChange={(event) => onReleaseGateVersionChange(event.currentTarget.value)}
          placeholder="Release version"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <input
          value={releaseGateEnvironment}
          onChange={(event) => onReleaseGateEnvironmentChange(event.currentTarget.value)}
          placeholder="Environment"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          value={releaseGateApproverName}
          onChange={(event) => onReleaseGateApproverNameChange(event.currentTarget.value)}
          placeholder="Approver"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <input
          value={releaseGateApproverRole}
          onChange={(event) => onReleaseGateApproverRoleChange(event.currentTarget.value)}
          placeholder="Approver role"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <button
          data-testid="enterprise-release-gate-submit"
          type="button"
          onClick={() => void onSubmitReleaseGateReview()}
          disabled={disabled || !canSubmitReview}
          className={buttonStyles({ variant: "dark", size: "sm" })}
        >
          <ShieldCheck className="h-4 w-4" /> Gate
        </button>
      </div>
      <textarea
        value={releaseGateNotes}
        onChange={(event) => onReleaseGateNotesChange(event.currentTarget.value)}
        placeholder="Release decision notes"
        disabled={disabled}
        className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
      />
      <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,0.65fr)]">
        <select
          data-testid="enterprise-release-gate-verification-status"
          value={releaseGateVerificationStatus}
          onChange={(event) => onReleaseGateVerificationStatusChange(event.currentTarget.value as EnterpriseReleaseVerificationStatus)}
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        >
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="not-run">Not run</option>
        </select>
        <textarea
          data-testid="enterprise-release-gate-verification-summary"
          value={releaseGateVerificationSummary}
          onChange={(event) => onReleaseGateVerificationSummaryChange(event.currentTarget.value)}
          placeholder="Verification evidence summary"
          disabled={disabled}
          className="min-h-20 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <input
          data-testid="enterprise-release-gate-verification-hash"
          value={releaseGateVerificationHash}
          onChange={(event) => onReleaseGateVerificationHashChange(event.currentTarget.value)}
          placeholder="Optional verification output SHA-256"
          disabled={disabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
      </div>
      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-2 text-xs font-semibold leading-5 text-muted">
        {latestReleaseGateReview
          ? `Latest: ${latestReleaseGateReview.releaseVersion} · ${latestReleaseGateReview.decision} · verification ${latestReleaseGateReview.verificationEvidence?.status ?? "missing"} · readiness ${latestReleaseGateReview.readinessSnapshot.blockingReview} blocking/${latestReleaseGateReview.readinessSnapshot.advisoryReview} advisory · platform ${latestReleaseGateReview.platformDecisionSnapshot.productionBlocking} blocking · ${new Date(latestReleaseGateReview.updatedAt).toLocaleString()}`
          : "No release gate review records loaded for this team."}
      </div>
    </div>
  );
}
