"use client";

// ─────────────────────────────────────────────────────────────────────────────
// session-dialog.tsx — "Save as session" flow shared by the Programs list (+
// menu → "Session from today's workout") and the Today screen (⋮ → "Save as
// session").
//
// A small Dialog with an input prefilled `Session · {d MMM}`; Save promotes
// the workout into a reusable SESSION-kind routine via POST
// /api/sessions/from-workout and toasts "Saved as session".
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tourAttrs } from "@/lib/tour/attrs";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { sessionsApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { formatDayShort } from "@/lib/client/format";
import { useRoutineRun } from "./screen-helpers";

export function useSessionFromWorkout(): {
  /** Open the dialog for a workout (default name from its day key). */
  openFor: (workoutId: string, dateKey: string) => void;
  /** Render wherever convenient — the name Dialog. */
  dialog: ReactNode;
} {
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState("Session");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // reset the draft during render whenever the dialog opens for a new workout
  const [lastOpen, setLastOpen] = useState<string | null>(null);
  const openKey = workoutId ? `${workoutId}:${defaultName}` : null;
  if (openKey !== lastOpen) {
    setLastOpen(openKey);
    if (workoutId) setDraft(defaultName);
  }

  const openFor = (id: string, dateKey: string) => {
    const name = `Session · ${formatDayShort(dateKey)}`;
    setDefaultName(name);
    setWorkoutId(id);
  };

  const close = () => setWorkoutId(null);

  const save = async () => {
    const id = workoutId;
    if (!id) return;
    const name = draft.trim() || defaultName;
    setSaving(true);
    if (!online) {
      queueMutation("/api/sessions/from-workout", "POST", { workoutId: id, name }, "Saved as session");
      invalidate.programs();
      toast.info("Saved as session — will sync when reconnected");
      setSaving(false);
      close();
      return;
    }
    const ok = await run(() => sessionsApi.fromWorkout(id, name), {
      path: "/api/sessions/from-workout",
      method: "POST",
      body: { workoutId: id, name },
      label: "Saved as session",
    });
    setSaving(false);
    if (ok) {
      invalidate.programs();
      toast.success(`Saved “${name}” as a session`);
      close();
    }
  };

  const dialog = (
    <Dialog open={workoutId != null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader className="text-left">
          <DialogTitle>Save as session</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          Turns this workout&apos;s exercises and sets into a reusable session.
        </p>
        <Input
          autoFocus
          value={draft}
          aria-label="Session name"
          maxLength={80}
          {...tourAttrs({ skipTour: true, reason: "Name field inside the save-as-session dialog" })}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          className="h-11"
        />
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            tour={{ skipTour: true, reason: "Cancel action inside the save-as-session dialog" }}
            onClick={close}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 gap-1.5"
            tour={{ skipTour: true, reason: "Save action inside the save-as-session dialog" }}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Save session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openFor, dialog };
}
