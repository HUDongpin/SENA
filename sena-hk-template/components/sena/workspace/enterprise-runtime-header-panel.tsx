import Link from "next/link";
import { Download } from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type {
  EnterpriseCollaborationState,
  EnterpriseContext
} from "./enterprise-contracts";

type EnterpriseValidationRun = EnterpriseCollaborationState["validationRuns"][number];

export type EnterpriseRuntimeHeaderPanelProps = {
  busy: boolean;
  enterpriseContext: EnterpriseContext | null;
  latestEnterpriseValidationRun: EnterpriseValidationRun | null;
  onExportEnterpriseExpertReviewDossierJson: () => unknown | Promise<unknown>;
  onExportEnterpriseValidationParityEvidenceJson: () => unknown | Promise<unknown>;
};

export function EnterpriseRuntimeHeaderPanel({
  busy,
  enterpriseContext,
  latestEnterpriseValidationRun,
  onExportEnterpriseExpertReviewDossierJson,
  onExportEnterpriseValidationParityEvidenceJson
}: EnterpriseRuntimeHeaderPanelProps) {
  const user = enterpriseContext?.user ?? null;
  const teamName = enterpriseContext?.teams[0]?.name ?? "SENA team";
  const role = enterpriseContext?.memberships[0]?.role ?? "member";
  const parityEvidence = latestEnterpriseValidationRun?.parityEvidence;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-sm font-black text-foreground">Enterprise runtime</div>
        <div className="mt-1 text-xs font-semibold leading-5 text-muted">
          {user
            ? `${user.name} · ${teamName} · ${role}`
            : "Sign in to use RBAC projects, server imports, reliability dashboards, and publication exports."}
        </div>
        <div data-testid="enterprise-claim-evidence-package" className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
          sena-enterprise-claim-evidence-package/v2
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
            sena-expert-review-list/v1 · sena-enterprise-expert-review/v1
          </span>
          <button
            type="button"
            data-testid="enterprise-expert-review-dossier-export"
            onClick={() => void onExportEnterpriseExpertReviewDossierJson()}
            disabled={!user || busy}
            className={buttonStyles({ variant: "secondary", size: "sm", className: "h-7 px-2 text-[0.65rem]" })}
          >
            <Download className="h-3.5 w-3.5" /> Expert review dossier
          </button>
        </div>
        <div
          data-testid="enterprise-validation-parity-evidence"
          data-visual-role="enterprise-validation-parity-evidence"
          className="mt-2 grid gap-1 rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1.5 text-[0.68rem] font-bold leading-4 text-muted"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-black uppercase tracking-[0.08em] text-cyanGlow">
              sena-validation-parity-evidence/v1 · {parityEvidence?.status ?? "pending"}
            </div>
            <button
              type="button"
              data-testid="enterprise-validation-parity-export"
              onClick={() => void onExportEnterpriseValidationParityEvidenceJson()}
              disabled={!parityEvidence}
              className={buttonStyles({ variant: "secondary", size: "sm", className: "h-7 px-2 text-[0.65rem]" })}
            >
              <Download className="h-3.5 w-3.5" /> Export validation parity
            </button>
          </div>
          <div data-testid="enterprise-validation-walkthrough-evidence" className="break-words">
            parityEvidence.walkthrough: {parityEvidence
              ? `${parityEvidence.walkthrough.source} · ${parityEvidence.walkthrough.status}${parityEvidence.walkthrough.datasetHash ? ` · sha256 ${parityEvidence.walkthrough.datasetHash.slice(0, 12)}` : ""}`
              : "pending project-linked analysis-run SHA-256"}
          </div>
          <div className="break-words">
            parityEvidence.runtimeParity: {parityEvidence
              ? parityEvidence.runtimeParity.map((evidence) => `${evidence.id}:${evidence.status}`).join(" · ")
              : "pending jENA/rENA and jSNA/R sna evidence"}
          </div>
          <div data-testid="enterprise-validation-inference-reference" className="break-words">
            parityEvidence.inference.studySpecificInferenceReference: {parityEvidence?.inference.studySpecificInferenceReference ?? "required-before-publication-claim"}
          </div>
          <div data-testid="enterprise-formal-inference-readiness" className="break-words">
            formalInference: {parityEvidence?.formalInference
              ? `${parityEvidence.formalInference.schemaVersion} · ${parityEvidence.formalInference.status} · minGroupSize=${parityEvidence.formalInference.minGroupSize} · warnings=${parityEvidence.formalInference.warnings.length}`
              : "sena-formal-inference-readiness/v1 · pending study-specific model evidence"}
          </div>
        </div>
      </div>
      {!user && (
        <div className="flex gap-2">
          <Link href="/login" className={buttonStyles({ variant: "secondary", size: "sm" })}>Login</Link>
          <Link href="/register" className={buttonStyles({ variant: "dark", size: "sm" })}>Register</Link>
        </div>
      )}
    </div>
  );
}
