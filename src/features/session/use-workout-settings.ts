"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useWorkoutSettings — Part 10 §3.5: the live-session settings writer shared by
// #/session (FocusCard speed chip) and #/session/settings (switch rows).
//
// Reads the store's settings copy (session bootstrap) and PATCHes
// /api/workout-settings with the SPEC's key names (autoAdvance → the existing
// UserSettings.autoMoveNextSet). Optimistic: the store flips immediately and
// reconciles with the server's full row; rollback + toast on failure.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { workoutSettingsApi, type WorkoutSettingsPatch } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { useQueryClient } from "@tanstack/react-query";

/** The §3.5 view-model over the raw settings row (spec names on the surface). */
export type WorkoutSettingsView = {
  autoAdvance: boolean;
  countdownSounds: boolean;
  showTempo: boolean;
  videoSpeed: number;
};

export function useWorkoutSettings(): {
  settings: WorkoutSettingsView;
  /** Optimistic patch (spec keys); returns false when the server rejected it. */
  patch: (patch: WorkoutSettingsPatch) => Promise<boolean>;
  saving: boolean;
} {
  const raw = useApp((s) => s.settings);
  const qc = useQueryClient();
  const invalidate = useInvalidate();

  const view: WorkoutSettingsView = {
    autoAdvance: raw?.autoMoveNextSet ?? true,
    countdownSounds: raw?.countdownSounds ?? false,
    showTempo: raw?.showTempo ?? true,
    videoSpeed: raw?.videoSpeed ?? 1,
  };

  const patch = useCallback(
    async (next: WorkoutSettingsPatch): Promise<boolean> => {
      const store = useApp.getState();
      const current = store.settings;
      // Optimistic overlay (spec names → row names).
      const optimistic = {
        ...(current ?? {}),
        ...(next.autoAdvance !== undefined ? { autoMoveNextSet: next.autoAdvance } : {}),
        ...(next.countdownSounds !== undefined ? { countdownSounds: next.countdownSounds } : {}),
        ...(next.showTempo !== undefined ? { showTempo: next.showTempo } : {}),
        ...(next.videoSpeed !== undefined ? { videoSpeed: next.videoSpeed } : {}),
      };
      if (current) useApp.setState({ settings: optimistic as typeof current });
      try {
        const updated = await workoutSettingsApi.update(next);
        useApp.setState({ settings: updated });
        const session = store.session;
        if (session) useApp.setState({ session: { ...session, settings: updated } });
        await qc.invalidateQueries({ queryKey: qk.settings });
        return true;
      } catch (e) {
        if (current) useApp.setState({ settings: current }); // rollback
        toast.error(e instanceof Error ? e.message : "Could not save settings");
        return false;
      }
    },
    [qc],
  );

  return { settings: view, patch, saving: false };
}
