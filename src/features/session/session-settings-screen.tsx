"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionSettingsScreen — #/session/settings (Part 10 §3.5).
//
//   TopBar (56) : back → #/session · "Session settings"
//   ScrollBody  : 56px switch rows — Auto-advance after rest · Countdown
//                 sounds · Show tempo · Video speed (chip → ActionList) —
//                 each PATCHes /api/workout-settings optimistically through
//                 useWorkoutSettings (the UserSettings singleton IS the spec's
//                 WorkoutSettings table).
//                 Danger row (L4: 4px red bar) "Exit workout" → the §3.6
//                 EndWorkoutDialog (same single exit flow as #/session ✕).
//
// No NavBar (a live-session sub-route). No BottomBar. Gate: no active
// session → #/session (which itself redirects to #/workout).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { Switch } from "@/components/ui/switch";
import { ActionList } from "@/components/shared/action-list";
import { FOCUS_VIDEO_SPEEDS } from "@/components/shared/media-block";
import { DoorOpen } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { workoutsApi } from "@/lib/client/api";
import { useWorkoutByDate } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import { replaceHash } from "@/features/shell/router";
import { hapticWarning } from "@/lib/client/haptics";
import type { WorkoutDTO } from "@/lib/types";
import { useWorkoutSettings } from "./use-workout-settings";
import { EndWorkoutDialog } from "./end-workout-dialog";

/** 1 Hz re-render while the session timer runs (live exit-dialog copy). */
function useTicker(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function speedChipLabel(s: number): string {
  return `${s}×`;
}

/** One 56px switch row (label + one-line help + trailing Switch). */
function SwitchRow({
  tour,
  label,
  help,
  checked,
  onToggle,
}: {
  tour: TourDecl;
  label: string;
  help: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      data-row
      className="flex h-14 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-border/60 px-4 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-none">{label}</p>
        <p className="mt-1 truncate text-xs leading-none text-muted-foreground">{help}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onToggle(v === true)}
        {...tourAttrs(tour)}
        aria-label={label}
      />
    </div>
  );
}

export default function SessionSettingsScreen() {
  const navigate = useApp((s) => s.navigate);
  const { settings, patch } = useWorkoutSettings();

  // ---------- gate: the active session (same resolution as #/session) ----------
  const byDateQuery = useWorkoutByDate(todayKey());
  const activeQuery = useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => workoutsApi.active(),
    staleTime: 15_000,
  });
  const usable = (w: WorkoutDTO | null | undefined): WorkoutDTO | null =>
    w && !w.finishedAt && w.removedAt == null ? w : null;
  const workout = usable(byDateQuery.data?.workout) ?? usable(activeQuery.data?.workout) ?? null;
  const loading = byDateQuery.isLoading || activeQuery.isLoading;

  useEffect(() => {
    if (!loading && !workout) replaceHash("#/session");
  }, [loading, workout]);

  // ---------- live total time (§3.2 — the exit dialog's copy) ----------
  const startAtMs = workout?.startAt ? new Date(workout.startAt).getTime() : null;
  const endAtMs = workout?.endAt ? new Date(workout.endAt).getTime() : null;
  const timerRunning = startAtMs != null && endAtMs == null;
  useTicker(timerRunning);
  const elapsedSec =
    startAtMs != null ? Math.max(0, ((endAtMs ?? Date.now()) - startAtMs) / 1000) : null;

  const [endOpen, setEndOpen] = useState(false);

  const toggle = useCallback(
    (key: "autoAdvance" | "countdownSounds" | "showTempo", next: boolean) => {
      void patch({ [key]: next });
    },
    [patch],
  );

  return (
    <Screen
      nav={false}
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/session" label="Back to session" />}
          title="Session settings"
        />
      }
    >
      <ScrollBody>
        {loading || !workout ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading settings">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : (
          <>
            <section
              aria-label="Live session settings"
              className="overflow-hidden rounded-lg border bg-card"
            >
              <SwitchRow
                tour={{ id: "sessionSettings.autoAdvance", label: "Auto-advance", help: "Focus moves to the next set when rest ends.", order: 20 }}
                label="Auto-advance after rest"
                help="Focus moves to the next set when rest ends"
                checked={settings.autoAdvance}
                onToggle={(v) => toggle("autoAdvance", v)}
              />
              <SwitchRow
                tour={{ id: "sessionSettings.countdownSounds", label: "Countdown sounds", help: "Beep the last three seconds of every rest.", order: 30 }}
                label="Countdown sounds"
                help="Beep the last three seconds of every rest"
                checked={settings.countdownSounds}
                onToggle={(v) => toggle("countdownSounds", v)}
              />
              <SwitchRow
                tour={{ id: "sessionSettings.showTempo", label: "Show tempo", help: "Display the tempo row on the focus card.", order: 40 }}
                label="Show tempo"
                help="Display the tempo row on the focus card"
                checked={settings.showTempo}
                onToggle={(v) => toggle("showTempo", v)}
              />
              {/* Video speed — value chip → ActionList (L3: no bottom sheets). */}
              <div
                data-row
                className="flex h-14 items-center gap-3 overflow-hidden whitespace-nowrap px-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-none">Video speed</p>
                  <p className="mt-1 truncate text-xs leading-none text-muted-foreground">
                    Playback rate of the demo video
                  </p>
                </div>
                <ActionList
                  label="Video speed"
                  trigger={
                    <span
                      {...tourAttrs({
                        id: "sessionSettings.videoSpeed",
                        label: "Video speed",
                        help: "Play demo videos at 0.5× to 1.5× — saved for every session.",
                        order: 50,
                      })}
                      role="button"
                      tabIndex={0}
                      className="flex h-8 flex-none items-center rounded-full border px-3 text-xs font-bold tabular-nums transition-colors hover:bg-accent"
                    >
                      {speedChipLabel(settings.videoSpeed)}
                    </span>
                  }
                  items={FOCUS_VIDEO_SPEEDS.map((s) => ({
                    id: String(s),
                    label: speedChipLabel(s),
                    checked: s === settings.videoSpeed,
                    onSelect: () => {
                      void patch({ videoSpeed: s });
                    },
                  }))}
                />
              </div>
            </section>

            {/* §3.5 danger row — the single exit flow (L4: 4px red bar). */}
            <button
              type="button"
              data-row
              {...tourAttrs({
                id: "sessionSettings.exit",
                label: "Exit workout",
                help: "End this workout — mark complete, save partial, or discard.",
                order: 60,
              })}
              className="relative flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40"
              onClick={() => {
                hapticWarning();
                setEndOpen(true);
              }}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-destructive" />
              <DoorOpen className="h-5 w-5 flex-none text-destructive" aria-hidden />
              <span className="flex-none text-sm font-bold text-destructive">Exit workout</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                Mark complete, save partial, or discard
              </span>
            </button>

            <p className="px-1 text-xs leading-snug text-muted-foreground">
              Settings apply immediately and persist for every future session.
            </p>

            {/* §3.6 — the single exit flow (shared with #/session ✕). */}
            <EndWorkoutDialog
              workout={workout}
              elapsedSec={elapsedSec}
              open={endOpen}
              onClose={() => setEndOpen(false)}
              onEnded={() => navigate("/workout")}
            />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
