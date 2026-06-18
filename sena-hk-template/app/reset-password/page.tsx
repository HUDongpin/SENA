"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { Button, Card } from "@/components/Primitives";

type ResetRequestPayload = {
  status?: string;
  expiresAt?: string;
  delivery?: {
    mode?: string;
    resetToken?: string;
    resetUrl?: string;
  };
  error?: string;
};

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [localResetUrl, setLocalResetUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) setResetToken(token);
  }, []);

  async function requestReset() {
    setStatus("loading");
    setMessage(null);
    setLocalResetUrl(null);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", email })
      });
      const payload = await response.json() as ResetRequestPayload;
      if (!response.ok) throw new Error(payload.error || "Password reset request failed.");
      if (payload.delivery?.resetToken) {
        setResetToken(payload.delivery.resetToken);
        setLocalResetUrl(payload.delivery.resetUrl ?? null);
        setMessage("Local reset token issued for this pilot runtime.");
      } else {
        setMessage("If an account exists, password reset instructions have been queued.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password reset request failed.");
    } finally {
      setStatus("idle");
    }
  }

  async function confirmReset() {
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", resetToken, password })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Password reset failed.");
      setPassword("");
      setConfirmPassword("");
      setMessage("Password reset complete. You can sign in with the new password.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password reset failed.");
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
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.95fr_1fr]">
          <div className="self-center">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-black text-cyanGlow hover:underline">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-foreground">Reset SENA access</h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-muted">
              Request a reset token for password accounts, then set a new password before returning to the research workspace.
            </p>
          </div>

          <Card className="rounded-[2.5rem] p-6 sm:p-8">
            <form className="grid gap-5" onSubmit={(event) => {
              event.preventDefault();
              void requestReset();
            }}>
              <label className="grid gap-2 text-sm font-bold text-foreground/80">
                Account email
                <span className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder="researcher@university.edu"
                    className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                  />
                </span>
              </label>
              <Button type="submit" className="w-full" disabled={status === "loading"}>
                {status === "loading" ? "Requesting..." : "Request reset token"}
              </Button>
            </form>

            <div className="my-7 h-px bg-cardBorder/55" />

            <form className="grid gap-5" onSubmit={(event) => {
              event.preventDefault();
              void confirmReset();
            }}>
              <label className="grid gap-2 text-sm font-bold text-foreground/80">
                Reset token
                <span className="relative">
                  <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <input
                    required
                    value={resetToken}
                    onChange={(event) => setResetToken(event.currentTarget.value.trim())}
                    placeholder="Paste reset token"
                    className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                  />
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  New password
                  <span className="relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input
                      required
                      minLength={12}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.currentTarget.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-12 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                    />
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-bold text-foreground/80">
                  Confirm password
                  <input
                    required
                    minLength={12}
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-4 text-foreground outline-none transition placeholder:text-muted/70 focus:border-cyanGlow"
                  />
                </label>
              </div>
              <p data-testid="enterprise-password-policy" className="rounded-2xl border border-cardBorder/45 bg-background/35 px-4 py-3 text-xs font-semibold leading-5 text-muted">
                Enterprise password policy: At least 12 characters with letters and numbers; avoid common passwords and the email name.
              </p>

              <Button type="submit" size="lg" className="w-full" disabled={status === "loading"}>
                {status === "loading" ? "Resetting..." : "Set new password"}
              </Button>
            </form>

            {message && (
              <div className="mt-5 rounded-2xl border border-cyanGlow/30 bg-cyanGlow/10 px-4 py-3 text-sm font-bold text-cyanGlow">
                {message}
              </div>
            )}

            {localResetUrl && (
              <div className="mt-4 break-all rounded-2xl border border-cardBorder/55 bg-background/45 px-4 py-3 text-xs font-semibold text-muted">
                Local reset URL: {localResetUrl}
              </div>
            )}
          </Card>
        </div>
      </section>
    </main>
  );
}
