import {
  CheckCircle2,
  LogOut,
  RotateCcw,
  ShieldCheck,
  X
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type {
  EnterpriseMfaSetup,
  EnterpriseMfaStatus,
  EnterpriseSessionList
} from "./enterprise-contracts";

type EnterpriseAccountSecurityHandler = () => unknown | Promise<unknown>;
type EnterpriseSessionRevokeHandler = (sessionId?: string, action?: "revoke-others") => unknown | Promise<unknown>;

export type EnterpriseAccountSecurityPanelProps = {
  disabled: boolean;
  busy: boolean;
  hasUser: boolean;
  enterpriseMfaStatus: EnterpriseMfaStatus | null;
  enterpriseMfaSetup: EnterpriseMfaSetup | null;
  enterpriseMfaEnableCode: string;
  enterpriseMfaDisableCode: string;
  enterpriseSessionList: EnterpriseSessionList | null;
  onStartMfaSetup: EnterpriseAccountSecurityHandler;
  onLogoutSession: EnterpriseAccountSecurityHandler;
  onMfaEnableCodeChange: (value: string) => void;
  onEnableMfa: EnterpriseAccountSecurityHandler;
  onMfaDisableCodeChange: (value: string) => void;
  onDisableMfa: EnterpriseAccountSecurityHandler;
  onRefreshSessionList: EnterpriseAccountSecurityHandler;
  onRevokeSession: EnterpriseSessionRevokeHandler;
};

export function EnterpriseAccountSecurityPanel({
  disabled,
  busy,
  hasUser,
  enterpriseMfaStatus,
  enterpriseMfaSetup,
  enterpriseMfaEnableCode,
  enterpriseMfaDisableCode,
  enterpriseSessionList,
  onStartMfaSetup,
  onLogoutSession,
  onMfaEnableCodeChange,
  onEnableMfa,
  onMfaDisableCodeChange,
  onDisableMfa,
  onRefreshSessionList,
  onRevokeSession
}: EnterpriseAccountSecurityPanelProps) {
  const nonCurrentSessionCount = enterpriseSessionList?.sessions.filter((session) => !session.current).length ?? 0;

  return (
    <div data-testid="enterprise-account-security" data-visual-role="enterprise-auth-mfa-controls" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Account security</div>
          <div data-testid="enterprise-mfa-status" className="mt-1 text-xs font-semibold leading-5 text-muted">
            MFA {enterpriseMfaStatus?.enabled ? `enabled · ${enterpriseMfaStatus.method}` : hasUser ? "not enabled" : "available after sign-in"}
            {enterpriseMfaStatus?.verifiedAt ? ` · verified ${new Date(enterpriseMfaStatus.verifiedAt).toLocaleDateString()}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="enterprise-mfa-setup" type="button" onClick={() => void onStartMfaSetup()} disabled={disabled || Boolean(enterpriseMfaStatus?.enabled)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <ShieldCheck className="h-4 w-4" /> Setup MFA
          </button>
          <button data-testid="enterprise-session-logout" type="button" onClick={() => void onLogoutSession()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
      {enterpriseMfaSetup && (
        <div className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold text-muted">
          <div className="font-black uppercase text-cyanGlow">Authenticator setup</div>
          <div>Secret: <code className="break-all text-foreground">{enterpriseMfaSetup.secret}</code></div>
          <div className="break-all">otpauth: <code>{enterpriseMfaSetup.otpauthUrl}</code></div>
          <div>Expires: {new Date(enterpriseMfaSetup.expiresAt).toLocaleString()}</div>
        </div>
      )}
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_16rem_auto]">
        <input
          data-testid="enterprise-mfa-enable-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={enterpriseMfaEnableCode}
          onChange={(event) => onMfaEnableCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Setup code"
          disabled={disabled || !enterpriseMfaSetup || Boolean(enterpriseMfaStatus?.enabled)}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <button type="button" onClick={() => void onEnableMfa()} disabled={disabled || !enterpriseMfaSetup || enterpriseMfaEnableCode.length !== 6 || Boolean(enterpriseMfaStatus?.enabled)} className={buttonStyles({ variant: "dark", size: "sm" })}>
          <CheckCircle2 className="h-4 w-4" /> Enable
        </button>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input
          data-testid="enterprise-mfa-disable-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={enterpriseMfaDisableCode}
          onChange={(event) => onMfaDisableCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Current MFA code"
          disabled={disabled || !enterpriseMfaStatus?.enabled}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
        />
        <button type="button" onClick={() => void onDisableMfa()} disabled={disabled || !enterpriseMfaStatus?.enabled || enterpriseMfaDisableCode.length !== 6} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <X className="h-4 w-4" /> Disable
        </button>
      </div>
      <div data-testid="enterprise-session-list" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black uppercase text-muted">Sessions</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {enterpriseSessionList
                ? `${enterpriseSessionList.sessions.length} active · ${enterpriseSessionList.sessionPolicy?.standardDays ?? enterpriseSessionList.sessionDays}d standard / ${enterpriseSessionList.sessionPolicy?.rememberedDays ?? enterpriseSessionList.sessionDays}d remembered`
                : "Sign in to load active sessions."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void onRefreshSessionList()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <RotateCcw className="h-4 w-4" /> Sessions
            </button>
            <button data-testid="enterprise-session-revoke-others" type="button" onClick={() => void onRevokeSession(undefined, "revoke-others")} disabled={disabled || nonCurrentSessionCount === 0} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <X className="h-4 w-4" /> Revoke others
            </button>
          </div>
        </div>
        {!enterpriseSessionList && (
          <div data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>No session list loaded.</div>
            <button data-testid="enterprise-session-revoke" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <X className="h-4 w-4" /> Revoke
            </button>
          </div>
        )}
        {enterpriseSessionList && enterpriseSessionList.sessions.length === 0 && (
          <div data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>No active sessions returned.</div>
            <button data-testid="enterprise-session-revoke" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <X className="h-4 w-4" /> Revoke
            </button>
          </div>
        )}
        {enterpriseSessionList?.sessions.slice(0, 4).map((session) => (
          <div key={session.id} data-testid="enterprise-session-row" className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="truncate font-black text-foreground">
                {session.current ? "Current session" : "Active session"} · {session.id}
              </div>
              <div className="truncate">
                {(session.sessionProfile ?? "standard")} · {session.ttlDays ?? enterpriseSessionList.sessionDays}d · Created {new Date(session.createdAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleString()}
              </div>
            </div>
            <button data-testid="enterprise-session-revoke" type="button" onClick={() => void onRevokeSession(session.id)} disabled={busy || session.current} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              {session.current ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />} {session.current ? "Current" : "Revoke"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
