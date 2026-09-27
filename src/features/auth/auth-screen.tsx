"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthScreen — #/auth (Part 3 p3-8 rebuild; Part 4 adds password reset).
//
// Spec: a centered 360px column filling the Screen — app brand (logo +
// "SetForge" + tagline), Tabs "Sign in | Create account", 48px inputs
// (email + password, + optional name on signup), 48px primary button,
// inline error text, loading state. NOTHING else: nav=false, no side panels,
// no TopBar. Authenticated visits of #/auth are redirected to #/today by the
// shell; unauthenticated users see this screen regardless of hash.
//
// Part 4 (audit B8): login mode gains "Forgot password?" → inline reset-request
// view (graceful disabled message when email is not configured) and a
// reset-confirm view reached via #/auth?reset=<token>.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Screen, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { toast } from "sonner";
import { Flame, Loader2, MailQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup" | "reset-request" | "reset-confirm";

function resetTokenFromHash(): string | null {
  const hash = window.location.hash ?? "";
  const q = hash.split("?")[1];
  if (!q) return null;
  return new URLSearchParams(q).get("reset");
}

export default function AuthScreen() {
  const setSession = useApp((s) => s.setSession);
  const navigate = useApp((s) => s.navigate);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Deep-link #/auth?reset=<token> → straight into the confirm view.
  useEffect(() => {
    const token = resetTokenFromHash();
    if (token) {
      setResetToken(token);
      setMode("reset-confirm");
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login" || mode === "signup") {
        const session =
          mode === "login"
            ? await authApi.login({ email, password })
            : await authApi.signup({
                email,
                password,
                name: name || undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
        setSession(session);
        toast.success(mode === "login" ? "Welcome back!" : "Account created — let's forge! 🔥");
        navigate("/today");
      } else if (mode === "reset-request") {
        const res = await authApi.requestReset({ email });
        setNotice(
          res.emailConfigured
            ? "If an account exists for this email, a reset link is on its way (valid for 1 hour)."
            : "Password reset email is not configured on this server. Contact your administrator to reset your password.",
        );
      } else if (mode === "reset-confirm") {
        if (!resetToken) throw new Error("Missing reset token — open the link from your email again.");
        if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
        await authApi.confirmReset({ token: resetToken, newPassword });
        toast.success("Password updated — sign in with your new password.");
        setMode("login");
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetToken(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const isAuthMode = mode === "login" || mode === "signup";

  return (
    <Screen nav={false}>
      <ScrollBody
        contentClassName="flex max-w-[360px] min-h-full justify-center gap-6 py-8 lg:max-w-[360px]"
      >
        {/* brand */}
        <div className="flex flex-none flex-col items-center gap-2 text-center">
          {mode === "reset-request" || mode === "reset-confirm" ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <MailQuestion className="h-7 w-7" aria-hidden />
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Flame className="h-7 w-7" aria-hidden />
            </div>
          )}
          <div>
            <p className="text-2xl font-black leading-none tracking-tight">SetForge</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {mode === "reset-request"
                ? "Reset your password"
                : mode === "reset-confirm"
                  ? "Choose a new password"
                  : "Forge every set. Track every rep."}
            </p>
          </div>
        </div>

        {/* tabs — Sign in | Create account (48px); hidden in reset views */}
        {isAuthMode ? (
          <div className="grid flex-none grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Authentication mode">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={cn(
                  "flex h-12 items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                  mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        ) : null}

        {/* form — 48px inputs, 48px primary button */}
        <form onSubmit={submit} className="flex flex-none flex-col gap-3">
          {isAuthMode && mode === "signup" ? (
            <Input
              type="text"
              className="h-12 rounded-lg"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              aria-label="Name (optional)"
            />
          ) : null}

          {(isAuthMode || mode === "reset-request") && (
            <Input
              type="email"
              required
              className="h-12 rounded-lg"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-label="Email"
            />
          )}

          {isAuthMode && (
            <Input
              type="password"
              required
              className="h-12 rounded-lg"
              placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              aria-label="Password"
            />
          )}

          {mode === "reset-confirm" && (
            <>
              <Input
                type="password"
                required
                className="h-12 rounded-lg"
                placeholder="New password (at least 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                aria-label="New password"
              />
              <Input
                type="password"
                required
                className="h-12 rounded-lg"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                aria-label="Repeat new password"
              />
            </>
          )}

          {error ? (
            <p className="flex-none rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="flex-none rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">
              {notice}
            </p>
          ) : null}

          <Button type="submit" className="h-12 rounded-lg text-base font-bold" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {mode === "login"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "reset-request"
                  ? "Send reset link"
                  : "Set new password"}
          </Button>

          {mode === "login" ? (
            <button
              type="button"
              className="h-11 rounded-lg px-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setMode("reset-request");
                setError(null);
                setNotice(null);
              }}
            >
              Forgot password?
            </button>
          ) : null}

          {!isAuthMode ? (
            <button
              type="button"
              className="h-11 rounded-lg px-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
              }}
            >
              ← Back to sign in
            </button>
          ) : null}
        </form>
      </ScrollBody>
    </Screen>
  );
}
