"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ChallengeBanner — Part 9 §10 (Home = the Workout tab, #/workout).
//
// Renders ABOVE the program card while an ACTIVE challenge exists
// (server rule: startsOn ≥ today-7, not dismissed) and the user has NOT
// joined it. Joined → the banner hides and the program card takes over with
// its "Starts in {n} days" CTA (programStartedAt = startsOn, cursor locked).
//
//   R1 48px  [CHALLENGE] chip · name (bold, ellipsis) · ✕ dismiss (44px)
//            — dismiss is SOFT (ChallengeDismiss row), no destructive confirm
//              needed: call challengesApi.dismiss → invalidate ["challenge"]
//              → card disappears.
//   R2 40px  "Starts {Mon, Oct 3} · {n} weeks" muted ellipsis · [Join]
//            — Join (primary-TINTED, small — the program card's CTA stays the
//              screen's ONE primary button) → challengesApi.join → invalidate
//              session/programs/dashboard/schedule/program-detail → toast
//              "Joined {name}" → banner disappears.
//
// 4px accent left bar (the SetForge colour law). Data: useActiveChallenge
// (5min staleTime, passive). No query → no banner (error states stay silent —
// the banner is opportunistic UI).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useActiveChallenge, useInvalidate, useOnline } from "@/lib/client/query";
import { challengesApi } from "@/lib/client/api";
import { formatDayLabel } from "@/lib/client/format";
import { rowBase, rowTall } from "@/lib/ui/tokens";
import { errorMessage } from "@/features/routines/screen-helpers";

export function ChallengeBanner() {
  const invalidate = useInvalidate();
  const online = useOnline();
  const challengeQuery = useActiveChallenge();
  const [busy, setBusy] = useState<"join" | "dismiss" | null>(null);

  const challenge = challengeQuery.data?.challenge ?? null;
  // §10: only an active, recent, NOT-joined challenge shows the banner.
  if (challengeQuery.isPending || !challenge || challenge.joined) return null;

  const dismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    try {
      await challengesApi.dismiss(challenge.id);
      await invalidate.challenge();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (busy) return;
    if (!online) {
      toast.info("Joining a challenge needs a connection");
      return;
    }
    setBusy("join");
    try {
      await challengesApi.join(challenge.id);
      // The user's own program copy starts on startsOn: the dashboard's
      // active payload flips to the challenge program with a FUTURE startedAt
      // (program card → "Starts in {n} days"), so every derived view refetches.
      invalidate.challenge();
      invalidate.session();
      invalidate.programs();
      invalidate.dashboard();
      invalidate.schedule();
      invalidate.programDetail();
      toast.success(`Joined ${challenge.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="Challenge banner"
      className="flex w-full flex-none overflow-hidden rounded-lg border bg-card"
    >
      {/* 4px accent left bar */}
      <div className="w-1 flex-none bg-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 48px row — Challenge chip · name · dismiss */}
        <div data-row className={`${rowTall} flex-none gap-2 pl-4 pr-1`}>
          <span className="flex h-5 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none text-muted-foreground">
            Challenge
          </span>
          <p className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{challenge.name}</p>
          <button
            type="button"
            {...tourAttrs({
              id: "challenge.dismiss",
              label: "Dismiss",
              help: "Hide this challenge — it stays hidden for your account.",
              order: 10,
            })}
            aria-label={`Dismiss ${challenge.name}`}
            onClick={() => void dismiss()}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {busy === "dismiss" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
        {/* 40px row — starts line · Join */}
        <div data-row className={`${rowBase} flex-none gap-2 px-4`}>
          <p className="min-w-0 flex-1 truncate text-sm leading-none text-muted-foreground">
            Starts {formatDayLabel(challenge.startsOn)} · {challenge.weeks} {challenge.weeks === 1 ? "week" : "weeks"}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={busy === "join"}
            tour={{
              id: "challenge.join",
              label: "Join challenge",
              help: "Start the challenge program at your difficulty on day one.",
              order: 20,
            }}
            onClick={() => void join()}
            className="h-8 flex-none border-primary/60 bg-primary/10 text-primary shadow-xs hover:bg-primary/20 hover:text-primary dark:border-primary/60 dark:bg-primary/10 dark:hover:bg-primary/20 dark:hover:text-primary"
          >
            {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Join
          </Button>
        </div>
      </div>
    </section>
  );
}
