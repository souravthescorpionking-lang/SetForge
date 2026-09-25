"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { toast } from "sonner";
import { Flame, Loader2, Lock, Mail, User, Zap, Trophy, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export function AuthView() {
  const setSession = useApp((s) => s.setSession);
  const navigate = useApp((s) => s.navigate);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session =
        mode === "login"
          ? await authApi.login({ email, password })
          : await authApi.signup({ email, password, name: name || undefined });
      setSession(session);
      toast.success(mode === "login" ? "Welcome back!" : "Account created — let's forge! 🔥");
      navigate("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background">
      <div className="w-full max-w-4xl grid lg:grid-cols-2 rounded-3xl overflow-hidden border border-border/60 shadow-2xl surface-glow">
        {/* Brand panel */}
        <div className="relative hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary via-primary to-[#7c2d12] text-primary-foreground">
          <Flame className="h-12 w-12" strokeWidth={1.5} />
          <div>
            <h1 className="text-4xl font-black tracking-tight leading-tight">
              Forge every set.
              <br />
              Track every rep.
            </h1>
            <p className="mt-4 text-primary-foreground/80 text-sm leading-relaxed max-w-sm">
              SetForge is your training ledger — multi-user, offline-ready, and obsessed with personal
              records.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                { icon: Zap, text: "Log workouts in seconds with smart steppers" },
                { icon: Trophy, text: "Personal records tracked & celebrated automatically" },
                { icon: CalendarDays, text: "Calendar, routines, graphs and body tracking" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-primary-foreground/60">
            Multi-user · Shared database · Works offline
          </p>
        </div>

        {/* Form panel */}
        <div className="p-6 sm:p-10 bg-card flex flex-col justify-center">
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="font-black text-lg leading-none">SetForge</p>
              <p className="text-xs text-muted-foreground mt-1">Workout tracker</p>
            </div>
          </div>

          <div className="flex rounded-xl bg-muted p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                  mode === m ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    className="pl-9"
                    placeholder="Alex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  className="pl-9"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  className="pl-9"
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full font-bold" size="lg" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {mode === "signup" && (
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Your account is seeded with 8 categories, ~100 common exercises, plate calculators and body
              measurements — ready to log immediately.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
