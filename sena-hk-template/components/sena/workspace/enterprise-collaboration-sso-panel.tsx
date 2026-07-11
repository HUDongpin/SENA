import {
  Activity,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  EnterpriseCollaborationState,
  EnterpriseSsoPreflight
} from "./enterprise-contracts";
import { enterpriseSsoProviderOptions } from "./enterprise-options";

type EnterpriseCollaborationSsoHandler = () => unknown | Promise<unknown>;

export type EnterpriseCollaborationSsoPanelProps = {
  disabled: boolean;
  hasActiveProject: boolean;
  enterpriseCollaboration: EnterpriseCollaborationState | null;
  enterpriseCollaborationTransport: "manual" | "streaming" | "reconnecting";
  enterpriseSsoPreflight: EnterpriseSsoPreflight | null;
  onDeliverCollaborationPubSub: EnterpriseCollaborationSsoHandler;
  onRunSsoPreflight: EnterpriseCollaborationSsoHandler;
};

export function EnterpriseCollaborationSsoPanel({
  disabled,
  hasActiveProject,
  enterpriseCollaboration,
  enterpriseCollaborationTransport,
  enterpriseSsoPreflight,
  onDeliverCollaborationPubSub,
  onRunSsoPreflight
}: EnterpriseCollaborationSsoPanelProps) {
  return (
    <>
      <div data-visual-role="enterprise-collaboration-pubsub-bridge" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-muted">Collaboration pub/sub</div>
            <div data-testid="enterprise-collaboration-pubsub-schema" className="mt-1 text-xs font-semibold leading-5 text-muted">
              {enterpriseCollaboration
                ? `${enterpriseCollaboration.presence.length} presence · ${enterpriseCollaboration.comments.length} comments · ${enterpriseCollaboration.adjudications.length} adjudications · sena-enterprise-collaboration-pubsub-delivery/v1`
                : `Project event bridge · ${enterpriseCollaborationTransport} · sena-enterprise-collaboration-pubsub-delivery/v1`}
            </div>
          </div>
          <button
            type="button"
            data-testid="enterprise-collaboration-pubsub-delivery"
            onClick={() => void onDeliverCollaborationPubSub()}
            disabled={disabled || !hasActiveProject}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            <Activity className="h-4 w-4" /> Deliver events
          </button>
        </div>
      </div>
      <div data-testid="enterprise-sso-preflight" data-visual-role="enterprise-sso-preflight" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-muted">SSO preflight</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              {enterpriseSsoPreflight
                ? `${enterpriseSsoPreflight.summary.checked} checked · ${enterpriseSsoPreflight.summary.passed} passed · ${enterpriseSsoPreflight.summary.review} review · sena-enterprise-sso-preflight/v1`
                : "OAuth/OIDC provider readiness · sena-enterprise-sso-preflight/v1"}
            </div>
          </div>
          <button
            type="button"
            data-testid="enterprise-sso-preflight-run"
            onClick={() => void onRunSsoPreflight()}
            disabled={disabled}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            <ShieldCheck className="h-4 w-4" /> Run preflight
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {enterpriseSsoProviderOptions.map((option) => {
            const preflight = enterpriseSsoPreflight?.providers.find((provider) => provider.provider === option.value);
            const passedChecks = preflight?.checks.filter((check) => check.status === "pass").length ?? 0;
            const reviewChecks = preflight?.checks.filter((check) => check.status === "review").length ?? 0;
            const checkCount = preflight?.checks.length ?? 0;
            const missingEvidence = preflight?.checks.flatMap((check) => check.evidence).find((entry) => entry.startsWith("missing="));
            return (
              <div key={option.value} data-testid="enterprise-sso-preflight-provider" className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-foreground">{option.label}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase", preflight?.status === "pass" ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-700" : "border-amber-400/45 bg-amber-400/10 text-amber-700")}>
                    {preflight?.status ?? "pending"}
                  </span>
                </div>
                <div className="truncate">
                  {preflight ? `${preflight.mode} · ${preflight.configured ? "configured" : "missing env"}` : "Not checked in this session"}
                </div>
                <div className="truncate">
                  Checks {passedChecks}/{checkCount} pass · review {reviewChecks}
                </div>
                <div className="truncate">
                  Callback hash {preflight?.endpointHashes.callback?.slice(0, 12) ?? "pending"}
                </div>
                <div className="truncate">
                  {missingEvidence ?? (preflight ? "missing=none" : "Run preflight to record evidence")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
