"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DayNotesScreen — #/days/{dayId}/notes/{reId} (Part 9 §5.4).
//
//   TopBar (56)  : BackButton (→ the day) · "Notes" · [Save — disabled until
//                  dirty] · TopBarHelp
//   ScrollBody   : exercise name (bold, single line) · Textarea (min-h ~40vh)
//                  prefilled with the DayOverride note for this SeriesExercise.
//   Save         : dayApi.putOverride(dayId, { notes: {...existing, [reId]:
//                  text} }) → invalidate the day query → back → toast
//                  "Note saved". While LOGGING, the note renders as one line
//                  under the exercise header (GroupCard entry.note, §5.4).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { dayApi } from "@/lib/client/api";
import { qk, useOnline } from "@/lib/client/query";
import { errorMessage } from "@/features/routines/screen-helpers";

export default function DayNotesScreen({ dayId, reId }: { dayId: string; reId?: string }) {
  return <DayNotesInner key={`${dayId}:${reId ?? ""}`} dayId={dayId} reId={reId} />;
}

function DayNotesInner({ dayId, reId }: { dayId: string; reId?: string }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // ---------- data: the merged day carries the current notes map ----------
  const { data: day, isLoading, error } = useQuery({
    queryKey: qk.day(dayId),
    queryFn: () => dayApi.get(dayId),
    retry: 1,
  });
  const current = useMemo(
    () => day?.exercises.find((e) => e.id === reId) ?? null,
    [day, reId],
  );
  const existingNote = day?.override?.notes?.[reId ?? ""] ?? "";

  // ---------- draft (resyncs when the server note changes) ----------
  const [draft, setDraft] = useState(existingNote);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated && day != null) {
      setDraft(existingNote);
      setHydrated(true);
    }
  }, [hydrated, day, existingNote]);
  const dirty = hydrated && draft !== existingNote;

  // ---------- save ----------
  const save = async () => {
    if (!day || !reId || saving || !dirty) return;
    if (!online) {
      toast.info("Saving a note needs a connection");
      return;
    }
    setSaving(true);
    try {
      const existing = day.override?.notes ?? {};
      const text = draft.trim();
      // Empty note → the key is dropped (no orphan 📝 rows).
      const notes = text
        ? { ...existing, [reId]: text }
        : Object.fromEntries(Object.entries(existing).filter(([k]) => k !== reId));
      await dayApi.putOverride(dayId, { notes });
      qc.invalidateQueries({ queryKey: ["day"] });
      toast.success("Note saved", { description: current?.exercise.name ?? day.name });
      navigate(`/days/${dayId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigate(`/days/${dayId}`);
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#/days/${dayId}`} label="Back to the day" />}
          title="Notes"
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={saving || !day || !reId || !dirty}
                aria-label="Save the note"
                tour={{ id: "dayNotes.save", label: "Save", help: "Save this note; it appears while logging the day.", order: 30 }}
                onClick={() => void save()}
              >
                <Save className="h-4 w-4" aria-hidden />
                {saving ? "Saving…" : "Save"}
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day" }}
              onClick={() => navigate("/workout")}
            >
              Back to workout
            </Button>
          </div>
        ) : isLoading || !day ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading note">
            <Skeleton className="h-8 w-2/3 rounded-lg" />
            <Skeleton className="h-[40vh] w-full rounded-lg" />
          </div>
        ) : !current || !reId ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Exercise not found in this day</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day exercise" }}
              onClick={() => navigate(`/days/${dayId}`)}
            >
              Back to the day
            </Button>
          </div>
        ) : (
          <>
            <div data-row className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">
                {current.exercise.name}
              </span>
              <span className="flex-none text-xs text-muted-foreground">{day.name}</span>
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Cues, setup reminders, left/right notes…"
              aria-label={`Note for ${current.exercise.name}`}
              {...tourAttrs({ id: "dayNotes.textarea", label: "Note field", help: "Your coaching note; one line shows while logging.", order: 20 })}
              className="min-h-[40vh] w-full flex-none resize-none text-base leading-relaxed"
            />
            <p className="flex-none px-1 text-xs leading-relaxed text-muted-foreground">
              Notes live on THIS day only — they follow the exercise into the logging screen, where one line
              shows under the exercise header (tap to expand).
            </p>
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
