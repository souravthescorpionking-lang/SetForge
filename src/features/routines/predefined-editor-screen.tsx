"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PredefinedEditorScreen — the Part 3 rebuild of
// #/routines/{id}/exercise/{reId} (predefined-sets editor).
//
//   TopBar (56)  : back → #/routines/{id} | exercise name | `Save`
//   ScrollBody   : legend row 32px (`↺ = copy from last workout`) + ONE
//                  ExerciseCard in `template` mode, expanded, header hidden.
//   BottomBar(56): `Skip (log freestyle)` — adds the bare exercise to TODAY's
//                  workout (no predefined values) and navigates to #/today.
//
// Set edits persist IMMEDIATELY (every update-set/add-set/remove-set/copy-last
// hits routinesApi right away) — `Save` confirms + returns. Blank cells render
// ↺ (copy from last workout); tapping it prefills from history.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import type { CardAction, CardSet, CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import { ExerciseCard } from "@/components/exercise-card/exercise-card";
import type { RoutineExerciseDTO } from "@/lib/types";
import {
  cardPatchToPredefinedInput,
  cardSetsOf,
  errorMessage,
  toCardExercise,
  useLastSetsPrefill,
  useRoutineRun,
} from "./screen-helpers";

export default function PredefinedEditorScreen({ routineId, reId }: { routineId: string; reId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useRoutineRun();
  const prefillFor = useLastSetsPrefill();

  // ---------- data (reId is unique across the routine — find its day) ----------
  const { data: routine, isLoading } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  const located = useMemo(() => {
    if (!routine) return null;
    for (const day of routine.days) {
      const re = day.exercises.find((e) => e.id === reId);
      if (re) return { day, re };
    }
    return null;
  }, [routine, reId]);

  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);

  // ---------- template mutations (immediate persist) ----------
  const day = located?.day;
  const re = located?.re;

  const patchSet = async (setId: string, patch: Partial<CardSet>) => {
    if (!day || !re) return;
    const input = cardPatchToPredefinedInput(patch);
    if (Object.keys(input).length === 0) return; // note-only: predefined sets carry no comments
    await run(() => routinesApi.updateSet(routineId, day.id, reId, setId, input), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
      method: "PATCH",
      body: input,
      label: "Set updated",
    });
  };

  const addSet = async () => {
    if (!day || !re) return;
    await run(() => routinesApi.addSet(routineId, day.id, reId, {}), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const removeSet = async (setId: string) => {
    if (!day || !re) return;
    await run(() => routinesApi.removeSet(routineId, day.id, reId, setId), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
      method: "DELETE",
      label: "Set removed",
    });
  };

  const copyLastToSet = async (setId: string) => {
    if (!day || !re) return;
    const sorted = [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = await prefillFor(re.exerciseId, idx);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    await run(
      () =>
        routinesApi.updateSet(routineId, day.id, reId, setId, {
          weight: src.weight,
          reps: src.reps,
          distance: src.distance,
          timeSec: src.timeSec,
        }),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
        method: "PATCH",
        body: { weight: src.weight, reps: src.reps, distance: src.distance, timeSec: src.timeSec },
        label: "Copied from last workout",
      },
    );
    toast.success("Copied from last workout");
  };

  // ---------- actions ----------
  const handleCardAction = (action: CardAction): void => {
    switch (action.type) {
      case "add-set":
        void addSet();
        break;
      case "update-set":
        void patchSet(action.setId, action.patch);
        break;
      case "remove-set":
        void removeSet(action.setId);
        break;
      case "copy-last":
        void copyLastToSet(action.setId);
        break;
      case "toggle-collapse":
      case "toggle-done":
      case "toggle-select":
      case "notes":
      case "rest-timer":
      case "move-up":
      case "move-down":
      case "add-to-group":
      case "replace":
      case "remove":
      case "select":
      case "open":
        break; // header is hidden — menu/header actions never fire here
    }
  };

  const save = () => {
    // Every edit already persisted — Save confirms and returns.
    toast.success("Saved");
    navigate(`/programs/${routineId}`);
  };

  const skipFreestyle = async () => {
    if (!re || skipping) return;
    if (!online) {
      toast.info("Logging freestyle needs a connection");
      return;
    }
    setSkipping(true);
    setBusy(true);
    try {
      const workout = await workoutsApi.createOrGet(todayKey());
      await workoutsApi.addExercise(workout.id, re.exerciseId);
      invalidate.workout(todayKey());
      toast.success(`${re.exercise.name} added to today — log it freestyle`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSkipping(false);
      setBusy(false);
    }
  };

  // ---------- render ----------
  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              onClick={() => navigate(`/programs/${routineId}`)}
              aria-label="Back to routine"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={re ? re.exercise.name : "Predefined sets"}
          actions={
            <Button
              type="button"
              className="h-11 flex-none gap-1.5 px-4"
              disabled={!located}
              onClick={save}
            >
              <Check className="h-4 w-4" aria-hidden />
              Save
            </Button>
          }
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-2 text-base font-bold"
            disabled={busy && skipping}
            onClick={() => void skipFreestyle()}
          >
            {skipping ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            Skip (log freestyle)
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading exercise">
            <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : !located || !re || !day ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Exercise not found in this routine</p>
            <Button type="button" variant="outline" onClick={() => navigate(`/programs/${routineId}`)}>
              Back to routine
            </Button>
          </div>
        ) : (
          <>
            {/* legend row (32px section header — not a data-row) */}
            <p className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-medium text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5 flex-none" aria-hidden />
              <span className="truncate">↺ = copy from last workout</span>
              <span className="truncate text-muted-foreground/60">
                · blank sets copy your previous session when the day is logged
              </span>
            </p>
            <ExerciseCard
              mode="template"
              exercise={toCardExercise(re, settings)}
              sets={cardSetsOf(re)}
              hideHeader
              visibleColumns={visibleColumns}
              onAction={handleCardAction}
            />
            <div className="h-4 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
