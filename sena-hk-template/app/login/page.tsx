"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Chrome, KeyRound, LockKeyhole, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { NetworkVisualization } from "@/components/NetworkVisualization";
import { Button, Card } from "@/components/Primitives";
import { useLanguage } from "@/components/LanguageProvider";

type SsoProvider = "institution" | "google" | "orcid";

type SsoProviderStatus = {
  provider: SsoProvider;
  configured: boolean;
  mode?: "oauth-oidc" | "local-pilot-fallback";
  fallbackPolicy?: {
    schemaVersion: "sena-enterprise-sso-fallback-policy/v1";
    enabled: boolean;
    productionRuntime: boolean;
    explicitOverride: boolean;
  };
  missingEnv?: string[];
};

type SsoPreflightResult = {
  schemaVersion: "sena-enterprise-sso-preflight/v1";
  summary: {
    checked: number;
    passed: number;
    review: number;
    configuredProviders: number;
  };
  providers: Array<{
    provider: SsoProvider;
    status: "pass" | "review";
    mode: "oauth-oidc" | "local-pilot-fallback";
    configured: boolean;
    errorCode?: string;
  }>;
};

type IdentityProductionGateSummary = {
  schemaVersion: "sena-enterprise-identity-production-gate-summary/v1";
  status: "review" | "ready";
  missingEvidenceIds: string[];
  institutionActionPlan: {
    summary: {
      lanes: number;
      blockingLanes: number;
      readyLanes: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
      submissionPath: string;
    };
  };
};

export default function LoginPage() {
  const { copy } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [rememberSession, setRememberSession] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{ challengeToken: string; expiresAt: string } | null>(null);
  const [ssoStatuses, setSsoStatuses] = useState<SsoProviderStatus[]>([]);
  const [preflight, setPreflight] = useState<SsoPreflightResult | null>(null);
  const [identityProductionGate, setIdentityProductionGate] = useState<IdentityProductionGateSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoError = params.get("sso_error");
    if (ssoError) setMessage(`SSO sign-in failed: ${ssoError.replace(/_/g, " ")}.`);
    void fetch("/api/auth/sso?status=1&preflight=1")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.providers) setSsoStatuses(payload.providers as SsoProviderStatus[]);
        if (payload?.preflight?.schemaVersion === "sena-enterprise-sso-preflight/v1") setPreflight(payload.preflight as SsoPreflightResult);
        if (payload?.identityProductionGate?.schemaVersion === "sena-enterprise-identity-production-gate-summary/v1") {
          setIdentityProductionGate(payload.identityProductionGate as IdentityProductionGateSummary);
        }
      })
      .catch(() => {
        setSsoStatuses([]);
        setPreflight(null);
        setIdentityProductionGate(null);
      });
  }, []);

  function configuredSsoProvider(provider: SsoProvider) {
    return Boolean(ssoStatuses.find((statusItem) => statusItem.provider === provider)?.configured);
  }

  function ssoProviderAvailabilityLabel(providerStatus: SsoProviderStatus) {
    if (providerStatus.configured) return "configured";
    if (providerStatus.fallbackPolicy?.schemaVersion === "sena-enterprise-sso-fallback-policy/v1" && !providerStatus.fallbackPolicy.enabled) {
      return "fallback disabled";
    }
    return "fallback";
  }

  async function submitLogin() {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          rememberSession,
          mfaCode: mfaChallenge ? mfaCode : undefined,
          mfaChallengeToken: mfaChallenge?.challengeToken
        })
      });
      const payload = await response.json();
      if (response.status === 202 && payload.mfaRequired) {
        setMfaChallenge({
          challengeToken: String(payload.challengeToken ?? ""),
          expiresAt: String(payload.expiresAt ?? "")
        });
        setMfaCode("");
        setMessage(null);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Login failed.");
      setMfaChallenge(null);
      router.push("/workspace/sena");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setStatus("idle");
    }
  }

  async function submitSso(provider: SsoProvider) {
    const ssoEmail = email || `researcher@${provider === "institution" ? "university.edu" : `${provider}.sena.local`}`;
    const redirectTo = "/workspace/sena";
    setStatus("loading");
    setMessage(null);
    try {
      if (configuredSsoProvider(provider)) {
        const params = new URLSearchParams({ provider, redirectTo });
        window.location.assign(`/api/auth/sso?${params.toString()}`);
        return;
      }
      const response = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          email: ssoEmail,
          name: ssoEmail.split("@")[0],
          organization: ssoEmail.split("@")[1] || "SENA Research Team",
          redirectTo
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SSO login failed.");
      if (payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }
      router.push("/workspace/sena");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SSO login failed.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <NavBar />
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-sena-radial" />
        <div className="sena-grid absolute inset-0 -z-10 animate-gridMove opacity-20" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="relative hidden lg:block">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-cyanGlow/20 via-violetGlow/20 to-magentaGlow/20 blur-3xl" />
            <NetworkVisualization compact />
            <div className="mt-5 grid grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, label: "Enterprise SSO ready" },
                { icon: UsersRound, label: "Role-based research team access" },
                { icon: LockKeyhole, label: "Audit-ready project logs" }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.label} className="rounded-2xl p-4">
                    <Icon className="h-5 w-5 text-cyanGlow" />
                    <p className="mt-3 text-sm font-bold leading-5 text-foreground/78">{item.label}</p>
                  </Card>
                );
              })}
            </div>
          </div>

          <Card className="mx-auto w-full max-w-xl rounded-[2.5rem] p-6 sm:p-8">
            <div className="mb-8">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyanGlow">Enterprise access</div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">{copy.nav.login} to SENA</h1>
              <p className="mt-3 text-base leading-7 text-muted">Secure access for research teams, labs, and institutions.</p>
            </div>

            <form data-testid="login-form" className="grid gap-5" onSubmit={(event) => {
              event.preventDefault();
              void submitLogin();
            }}>
              <label className="grid gap-2 text-sm font-bold text-foreground/80">
                {copy.labels.email}
                <span className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <input
                    data-testid="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.currentTarget.value);
                      setMfaChallenge(null);
                      setMfaCode("");
                    }}
                    placeholder="researcher@university.edu"
                    className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                  />
                </span>
              </label>

              <label className="grid gap-2 text-sm font-bold text-foreground/80">
                {copy.labels.password}
                <span className="relative">
                  <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <input
                    data-testid="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => {
                      setPassword(event.currentTarget.value);
                      setMfaChallenge(null);
                      setMfaCode("");
                    }}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                  />
                </span>
              </label>

              {mfaChallenge && (
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  Authenticator code
                  <span className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                    />
                  </span>
                  <span className="text-xs font-semibold text-muted">Challenge expires at {new Date(mfaChallenge.expiresAt).toLocaleTimeString()}.</span>
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 font-semibold text-muted">
                  <input
                    data-testid="login-remember-session"
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) => setRememberSession(event.currentTarget.checked)}
                    className="h-4 w-4 rounded border-cardBorder bg-background"
                  />
                  {copy.labels.remember}
                </label>
                <Link href="/reset-password" className="font-bold text-cyanGlow hover:underline">{copy.labels.forgot}</Link>
              </div>

              {message && (
                <div className="rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100">
                  {message}
                </div>
              )}

              <Button data-testid="login-submit" type="submit" size="lg" className="w-full" disabled={status === "loading"}>
                {status === "loading" ? "Signing in..." : mfaChallenge ? "Verify code" : copy.nav.login}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-[0.22em] text-muted">
              <div className="h-px flex-1 bg-cardBorder/55" /> Secure sign-in options <div className="h-px flex-1 bg-cardBorder/55" />
            </div>

            <div className="grid gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("institution")} disabled={status === "loading"}><Building2 className="h-5 w-5" />{copy.labels.sso}</Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("orcid")} disabled={status === "loading"}><ShieldCheck className="h-5 w-5" />{copy.labels.orcid}</Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("google")} disabled={status === "loading"}><Chrome className="h-5 w-5" />{copy.labels.google}</Button>
            </div>
            <div data-testid="auth-sso-preflight-evidence" className="mt-4 rounded-2xl border border-cardBorder/45 bg-background/35 p-3 text-xs font-semibold leading-5 text-muted">
              <div className="font-black uppercase tracking-[0.14em] text-cyanGlow">
                sena-enterprise-sso-preflight/v1 · {preflight?.summary.passed ?? 0}/{preflight?.summary.checked ?? ssoStatuses.length} pass · configured {preflight?.summary.configuredProviders ?? ssoStatuses.filter((providerStatus) => providerStatus.configured).length}
              </div>
              {identityProductionGate && (
                <div data-testid="auth-identity-production-gate" className="mt-2 rounded-lg border border-cardBorder/40 bg-background/45 px-2 py-1">
                  <span className="font-black text-foreground">identity gate</span> · {identityProductionGate.status} · sena-enterprise-identity-production-gate-summary/v1 · action lanes {identityProductionGate?.institutionActionPlan.summary.blockingLanes}/{identityProductionGate.institutionActionPlan.summary.lanes} blocking · missing {identityProductionGate.missingEvidenceIds.length} · {identityProductionGate.institutionActionPlan.summary.submissionPath}
                </div>
              )}
              <div className="mt-2 grid gap-1 sm:grid-cols-3">
                {(["institution", "orcid", "google"] as SsoProvider[]).map((provider) => {
                  const providerPreflight = preflight?.providers.find((statusItem) => statusItem.provider === provider);
                  const providerStatus = ssoStatuses.find((statusItem) => statusItem.provider === provider) ?? {
                    provider,
                    configured: providerPreflight?.configured ?? false,
                    mode: providerPreflight?.mode
                  };
                  return (
                    <div key={provider} data-testid="auth-sso-provider-evidence" className="rounded-lg border border-cardBorder/40 bg-background/45 px-2 py-1">
                      <span className="font-black text-foreground">{provider}</span> · {providerStatus.mode ?? providerPreflight?.mode ?? "unknown"} · {ssoProviderAvailabilityLabel(providerStatus)} · {providerPreflight?.status ?? "pending"}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-8 text-center text-sm text-muted">
              {copy.labels.noAccount} <Link href="/register" className="font-black text-cyanGlow hover:underline">{copy.nav.register}</Link>
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
