"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PasswordScreen — #/account/password (Part 10 §9). Credentials-only change
// flow: current · new · confirm, with a local strength meter (no dependency —
// score 0-4 from length + character classes; Save requires ≥3 per spec) and
// a must-differ check. Success keeps the session (server: changePasswordKeepSession)
// and returns to #/profile.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tourAttrs } from "@/lib/tour/attrs";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { userAccountApi } from "@/lib/client/api";
import { useOnline } from "@/lib/client/query";
import { rowBase } from "@/lib/ui/tokens";
import { errorMessage } from "@/features/routines/screen-helpers";

/** Local zxcvbn-style heuristic — score 0-4 (spec requires ≥3 to save). */
export function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 14) score += 1;
  let classes = 0;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) classes += 1;
  if (/\d/.test(pw)) classes += 1;
  if (/[^A-Za-z0-9]/.test(pw)) classes += 1;
  score += Math.min(classes, 2);
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export default function PasswordScreen() {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const session = useApp((s) => s.session);
  const hasCredentials = session?.user?.email != null; // credentials-only auth in this app

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showStrength, setShowStrength] = useState(false);

  const strength = useMemo(() => passwordStrength(next), [next]);
  const currentError = current.length > 0 && current.length < 8 ? "Enter your current password" : null;
  const nextError = showStrength && next.length > 0 && strength < 3 ? `Strength: ${STRENGTH_LABELS[strength]} — needs at least 3 of 4` : null;
  const confirmError = confirm.length > 0 && confirm !== next ? "Passwords do not match" : null;
  const sameError = next.length > 0 && current.length > 0 && next === current ? "New password must differ from the current one" : null;
  const canSave = !busy && current.length >= 8 && next.length >= 8 && strength >= 3 && next === confirm && next !== current;

  const save = async () => {
    if (!canSave || !online) return;
    setBusy(true);
    try {
      await userAccountApi.changePassword({ currentPassword: current, newPassword: next });
      toast.success("Password changed");
      navigate("/profile");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!hasCredentials) {
    return (
      <Screen topBar={<TopBar title="Change password" leading={<BackButton fallbackHash="#/profile" label="Profile" />} />}>
        <ScrollBody>
          <div data-row className={`${rowBase} justify-center rounded-lg border bg-card px-4 text-sm text-muted-foreground`}>
            Password change needs an email-and-password account.
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen
      topBar={<TopBar title="Change password" leading={<BackButton fallbackHash="#/profile" label="Profile" />} />}
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-12 w-full text-sm font-semibold"
            disabled={!canSave || !online}
            {...tourAttrs({ id: "accountPassword.save", label: "Save password", help: "Verify your current password and set the new one.", order: 20 })}
            onClick={() => void save()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Change password
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody contentClassName="flex flex-col gap-3">
        <div data-row className={`${rowBase} gap-2 rounded-lg border bg-card px-3`}>
          <Lock className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Use at least 10 characters with a mix of cases, a number and a symbol.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="px-1 text-xs font-medium text-muted-foreground">Current password</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            {...tourAttrs({ id: "accountPassword.current", label: "Current password", help: "Confirm it's you with your existing password.", order: 30 })}
            className="h-12 rounded-lg"
          />
          {currentError ? <span className="px-1 text-xs text-destructive">{currentError}</span> : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-1 text-xs font-medium text-muted-foreground">New password</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setShowStrength(true);
            }}
            {...tourAttrs({ id: "accountPassword.next", label: "New password", help: "At least strength 3 on the meter below.", order: 40 })}
            className="h-12 rounded-lg"
          />
          {next.length > 0 ? (
            <span className="flex items-center gap-2 px-1" aria-live="polite">
              <span className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-full flex-1 rounded-full transition-colors",
                      i < strength ? (strength <= 1 ? "bg-destructive" : strength === 2 ? "bg-amber-500" : "bg-primary") : "bg-border",
                    )}
                  />
                ))}
              </span>
              <span className="flex-none text-xs tabular-nums text-muted-foreground">{STRENGTH_LABELS[strength]}</span>
            </span>
          ) : null}
          {nextError ? <span className="px-1 text-xs text-destructive">{nextError}</span> : null}
          {sameError ? <span className="px-1 text-xs text-destructive">{sameError}</span> : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-1 text-xs font-medium text-muted-foreground">Confirm new password</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            {...tourAttrs({ id: "accountPassword.confirm", label: "Confirm new password", help: "Repeat the new password exactly.", order: 50 })}
            className="h-12 rounded-lg"
          />
          {confirmError ? <span className="px-1 text-xs text-destructive">{confirmError}</span> : null}
        </label>
      </ScrollBody>
    </Screen>
  );
}
