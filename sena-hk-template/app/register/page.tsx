"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Chrome, FlaskConical, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound, UsersRound } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { Button, Card } from "@/components/Primitives";
import { useLanguage } from "@/components/LanguageProvider";

const plans = [
  { title: "Individual Researcher", icon: UserRound, text: "For graduate students and independent research projects." },
  { title: "Research Lab", icon: FlaskConical, text: "For coding teams, grant projects, and shared datasets." },
  { title: "Enterprise / Institution", icon: Building2, text: "For SSO, role policies, audit logs, and institutional governance." }
];

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

function TeamNetworkVisual() {
  return (
    <Card className="relative overflow-hidden rounded-[2.5rem] p-8">
      <div className="absolute inset-0 bg-sena-radial opacity-70" />
      <div className="sena-grid absolute inset-0 animate-gridMove opacity-20" />
      <div className="relative z-10">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-cyanGlow">Secure workspace</div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground">Invite your research team into a shared SENA project.</h2>
        <p className="mt-4 text-base leading-8 text-muted">Manage coding roles, audit changes, run comparative network analyses, and export reproducible reports.</p>
        <svg viewBox="0 0 460 300" className="mt-6 h-72 w-full" aria-label="Research team network visual">
          <defs>
            <linearGradient id="team-grad" x1="0" x2="460" y1="0" y2="300" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(var(--glow-cyan))" />
              <stop offset="0.55" stopColor="rgb(var(--glow-violet))" />
              <stop offset="1" stopColor="rgb(var(--glow-magenta))" />
            </linearGradient>
          </defs>
          {[
            "M80 70 L210 52 L340 86 L388 210 L224 246 L96 205 Z",
            "M80 70 L224 246",
            "M210 52 L388 210",
            "M96 205 L340 86",
            "M210 52 L224 246"
          ].map((d) => <path key={d} d={d} fill="none" stroke="url(#team-grad)" strokeWidth="2" opacity="0.45" />)}
          {[
            [80, 70, "PI"], [210, 52, "Coder"], [340, 86, "Lab"], [388, 210, "Admin"], [224, 246, "Reviewer"], [96, 205, "Student"]
          ].map(([x, y, label]) => (
            <g key={label as string}>
              <circle cx={x as number} cy={y as number} r="22" fill="rgb(var(--card) / 0.72)" stroke="url(#team-grad)" strokeWidth="3" />
              <text x={x as number} y={(y as number) + 5} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="11" fontWeight="800">{label as string}</text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

export default function RegisterPage() {
  const { copy } = useLanguage();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("Researcher");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [plan, setPlan] = useState<"individual" | "lab" | "enterprise">("lab");
  const [ssoStatuses, setSsoStatuses] = useState<SsoProviderStatus[]>([]);
  const [preflight, setPreflight] = useState<SsoPreflightResult | null>(null);
  const [identityProductionGate, setIdentityProductionGate] = useState<IdentityProductionGateSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("inviteCode") || params.get("invite");
    if (invite) setInviteCode((current) => current || invite);
    const ssoError = params.get("sso_error");
    if (ssoError) setMessage(`SSO registration failed: ${ssoError.replace(/_/g, " ")}.`);
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

  async function submitRegister() {
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email,
          organization,
          role,
          password,
          inviteCode,
          plan
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Registration failed.");
      router.push("/workspace/sena");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration failed.");
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
        if (inviteCode.trim()) params.set("inviteCode", inviteCode.trim());
        window.location.assign(`/api/auth/sso?${params.toString()}`);
        return;
      }
      const response = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          email: ssoEmail,
          name: fullName || ssoEmail.split("@")[0],
          organization: organization || ssoEmail.split("@")[1] || "SENA Research Team",
          redirectTo,
          inviteCode: inviteCode.trim() || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SSO registration failed.");
      if (payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }
      router.push("/workspace/sena");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SSO registration failed.");
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
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1fr]">
          <Card className="rounded-[2.5rem] p-6 sm:p-8">
            <div className="mb-8">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyanGlow">Create account</div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">{copy.nav.register} for SENA.HK</h1>
              <p className="mt-3 text-base leading-7 text-muted">Start an individual project, research lab workspace, or institution-ready deployment.</p>
            </div>

            <form data-testid="register-form" className="grid gap-5" onSubmit={(event) => {
              event.preventDefault();
              void submitRegister();
            }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.fullName}
                  <span className="relative">
                    <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input data-testid="register-full-name" required value={fullName} onChange={(event) => setFullName(event.currentTarget.value)} placeholder="Dr. Ada Chen" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none focus:border-cyanGlow" />
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.email}
                  <span className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input data-testid="register-email" required type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="researcher@university.edu" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none focus:border-cyanGlow" />
                  </span>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.organization}
                  <input data-testid="register-organization" required value={organization} onChange={(event) => setOrganization(event.currentTarget.value)} placeholder="University / Lab" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-4 text-foreground outline-none focus:border-cyanGlow" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.role}
                  <select value={role} onChange={(event) => setRole(event.currentTarget.value)} className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-4 text-foreground outline-none focus:border-cyanGlow">
                    <option>Researcher</option>
                    <option>Educator</option>
                    <option>Lab Admin</option>
                    <option>Student</option>
                    <option>Enterprise</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.password}
                  <span className="relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input data-testid="register-password" required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} placeholder="••••••••••••" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none focus:border-cyanGlow" />
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  {copy.labels.confirmPassword}
                  <input data-testid="register-confirm-password" required minLength={12} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} placeholder="••••••••••••" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-4 text-foreground outline-none focus:border-cyanGlow" />
                </label>
              </div>
              <p data-testid="enterprise-password-policy" className="rounded-2xl border border-cardBorder/45 bg-background/35 px-4 py-3 text-xs font-semibold leading-5 text-muted">
                Enterprise password policy: At least 12 characters with letters and numbers; avoid common passwords and the email name.
              </p>

              <label className="grid gap-2 text-sm font-bold text-foreground/80">
                {copy.labels.inviteCode}
                <input value={inviteCode} onChange={(event) => setInviteCode(event.currentTarget.value)} placeholder="SENA-LAB-2026" className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-4 text-foreground outline-none focus:border-cyanGlow" />
              </label>

              <div>
                <div className="mb-3 text-sm font-black text-foreground/80">Plan</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {plans.map((planOption, index) => {
                    const Icon = planOption.icon;
                    const planValue = index === 0 ? "individual" : index === 1 ? "lab" : "enterprise";
                    return (
                      <label key={planOption.title} className="cursor-pointer rounded-3xl border border-cardBorder/45 bg-background/35 p-4 transition hover:border-cyanGlow/45 hover:bg-card/55">
                        <input
                          type="radio"
                          name="plan"
                          checked={planValue === plan}
                          onChange={() => setPlan(planValue)}
                          className="sr-only"
                        />
                        <Icon className="h-5 w-5 text-cyanGlow" />
                        <div className="mt-3 text-sm font-black text-foreground">{planOption.title}</div>
                        <p className="mt-2 text-xs leading-5 text-muted">{planOption.text}</p>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 text-sm text-muted">
                <label className="flex gap-3"><input data-testid="register-terms" required type="checkbox" className="mt-1 h-4 w-4" /> I agree to the Terms and responsible AI use policy.</label>
                <label className="flex gap-3"><input type="checkbox" className="mt-1 h-4 w-4" /> Receive product updates and research-platform announcements.</label>
              </div>

              {message && (
                <div className="rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100">
                  {message}
                </div>
              )}

              <Button data-testid="register-submit" type="submit" size="lg" className="w-full" disabled={status === "loading"}>
                <Sparkles className="h-5 w-5" />{status === "loading" ? "Creating workspace..." : copy.nav.register}
              </Button>
            </form>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("institution")} disabled={status === "loading"}><ShieldCheck className="h-5 w-5" />SSO</Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("orcid")} disabled={status === "loading"}><ShieldCheck className="h-5 w-5" />ORCID</Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void submitSso("google")} disabled={status === "loading"}><Chrome className="h-5 w-5" />Google</Button>
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
              {copy.labels.already} <Link href="/login" className="font-black text-cyanGlow hover:underline">{copy.nav.login}</Link>
            </p>
          </Card>

          <div className="hidden lg:block">
            <TeamNetworkVisual />
          </div>
        </div>
      </section>
    </main>
  );
}
