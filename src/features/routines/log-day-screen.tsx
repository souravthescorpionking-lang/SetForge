"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogDayScreen — the Part 3 rebuild of #/routines/{id}/log/{dayId}.
//
//   TopBar (56)  : back → #/routines/{id} | `Log: {DayName}`
//   ScrollBody   : ExerciseCard×N in `preview` mode — the row checkbox in the
//                  `#` column selects/deselects the set for logging (default:
//                  ALL selected); tapping a cell edits the value inline (local
//                  draft state — nothing persists until the log runs); the ✓
//                  column drafts "log as completed".
//   BottomBar(56): `Add {N} sets to today` — N = selected sets count.
//
// Log flow (legacy log-all-dialog logic): logDay creates the workout + sets,
// then this screen applies the drafts and removes deselected sets on the
// freshly created rows (pre-existing exercises on the target date are never
// touched). Blank templates keep their server-side copy-previous semantics;
// per-set ops are index-matched and skipped when the copy changed the count.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import type { CardAction, CardSet, CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import { ExerciseCard } from "@/components/exercise-card/exercise-card";
import type { RoutineExerciseDTO } from "@/lib/types";
import {
  cardSetsOf,
  errorMessage,
  toCardExercise,
} from "./screen-helpers";

/** CardSet patch → SetInput (same mapping as the Today screen). */
function cardPatchToSetInput(patch: Partial<CardSet>): SetInput {
  const out: SetInput = {};
  if ("weightKg" in patch) out.weight = patch.weightKg ?? null;
  if ("reps" in patch) out.reps = patch.reps ?? null;
  if ("distanceM" in patch) out.distance = patch.distanceM ?? null;
  if ("timeSec" in patch) out.timeSec = patch.timeSec ?? null;
  if ("rpe" in patch) out.rpe = patch.rpe ?? null;
  if ("tempo" in patch) out.tempo = patch.tempo ?? null;
  if ("restPlannedSec" in patch) out.restPlannedSec = patch.restPlannedSec ?? null;
  if ("setType" in patch) out.setType = patch.setType ?? "NORMAL";
  if ("note" in patch) out.comment = patch.note ?? null;
  if ("done" in patch) out.isComplete = !!patch.done;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LogDayScreen — keyed by routineId+dayId so the draft state resets naturally.
// ─────────────────────────────────────────────────────────────────────────────

export default function LogDayScreen({ routineId, dayId }: { routineId: string; dayId: string }) {
  return <LogDayInner key={`${routineId}:${dayId}`} routineId={routineId} dayId={dayId} />;
}

function LogDayInner({ routineId, dayId }: { routineId: string; dayId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();

  // ---------- data ----------
  const { data: routine, isLoading } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });
  const day = useMemo(() => routine?.days.find((d) => d.id === dayId) ?? null, [routine, dayId]);
  const exercises = useMemo(
    () => (day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [day],
  );

  // ---------- local draft state (nothing persists until the log runs) ----------
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Partial<CardSet>>>({});
  const [doneDrafts, setDoneDrafts] = useState<Record<string, boolean>>({});
  const [collapsedReIds, setCollapsedReIds] = useState<Set<string>>(new Set());
  const [logging, setLogging] = useState(false);

  const totalSets = exercises.reduce((n, re) => n + re.sets.length, 0);
  const selectedCount = totalSets - deselected.size;

  // ---------- the log run (legacy log-all-dialog flow) ----------
  const doLog = async () => {
    if (!routine || !day || logging || selectedCount === 0) return;
    setLogging(true);
    const dateKey = todayKey();
    try {
      // Best-effort guard: workout exercises that already existed on the
      // target date — the skip-removal below never deletes user-entered work.
      let preExisting = new Set<string>();
      if (deselected.size > 0) {
        try {
          const existing = await workoutsApi.byDate(dateKey);
          preExisting = new Set((existing.workout?.exercises ?? []).map((we) => we.id));
        } catch {
          /* best-effort only */
        }
      }

      const workout = await routinesApi.logDay(routineId, { dayId: day.id, date: dateKey });

      for (const re of exercises) {
        const we = workout.exercises.find((e) => e.exerciseId === re.exerciseId);
        if (!we) continue;
        const reSets = [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder);
        const weSets = [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder);
        const allDeselected = reSets.length > 0 && reSets.every((s) => deselected.has(s.id));
        if (allDeselected) {
          if (!preExisting.has(we.id)) {
            try {
              await workoutsApi.removeExercise(workout.id, we.id);
            } catch {
              /* best-effort skip removal */
            }
          }
          continue;
        }
        // Blank templates copy the previous workout server-side — when that
        // changed the set count, index matching is unsafe: keep them as logged.
        if (weSets.length !== reSets.length) continue;
        for (let i = 0; i < reSets.length; i++) {
          const pre = reSets[i];
          const created = weSets[i];
          if (deselected.has(pre.id)) {
            try {
              await workoutsApi.removeSet(workout.id, we.id, created.id);
            } catch {
              /* best-effort skip removal */
            }
            continue;
          }
          const patch = cardPatchToSetInput(drafts[pre.id] ?? {});
          if (doneDrafts[pre.id]) patch.isComplete = true;
          if (Object.keys(patch).length > 0) {
            try {
              await workoutsApi.updateSet(workout.id, we.id, created.id, patch);
            } catch {
              /* best-effort draft application */
            }
          }
        }
      }

      invalidate.workout(dateKey);
      toast.success(`Logged ${selectedCount} set${selectedCount === 1 ? "" : "s"} to today`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLogging(false);
    }
  };

  // ---------- card action dispatch ----------
  const handleCardAction =
    (re: RoutineExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "toggle-collapse":
          setCollapsedReIds((prev) => {
            const next = new Set(prev);
            if (next.has(re.id)) next.delete(re.id);
            else next.add(re.id);
            return next;
          });
          break;
        case "toggle-select":
          setDeselected((prev) => {
            const next = new Set(prev);
            if (next.has(action.setId)) next.delete(action.setId);
            else next.add(action.setId);
            return next;
          });
          break;
        case "update-set":
          setDrafts((prev) => ({
            ...prev,
            [action.setId]: { ...(prev[action.setId] ?? {}), ...action.patch },
          }));
          break;
        case "toggle-done":
          setDoneDrafts((prev) => ({ ...prev, [action.setId]: !prev[action.setId] }));
          break;
        case "notes":
          toast.info("Notes live on logged sets — add them from the Today screen");
          break;
        case "select":
          toast.info("Tap the row checkboxes to pick the sets you log");
          break;
        case "open":
          toast.info("This preview becomes real once you log the day");
          break;
        case "add-set":
        case "copy-last":
        case "remove-set":
        case "move-up":
        case "move-down":
        case "remove":
        case "add-to-group":
        case "replace":
        case "rest-timer":
          break; // template/edit-mode-only actions; never emitted by preview cards
      }
    };

  // ---------- card mapping ----------
  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const previewSets = (re: RoutineExerciseDTO): CardSet[] =>
    cardSetsOf(re).map((s) => ({
      ...s,
      ...(drafts[s.id] ?? {}),
      selected: !deselected.has(s.id),
      done: doneDrafts[s.id] ?? false,
    }));

  // ---------- render ----------
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
          title={day ? `Log: ${day.name}` : "Log day"}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-2 text-base font-bold"
            disabled={logging || selectedCount === 0}
            onClick={() => void doLog()}
          >
            {logging ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Zap className="h-5 w-5" aria-hidden />
            )}
            {online
              ? `Add ${selectedCount} set${selectedCount === 1 ? "" : "s"} to today`
              : "Connection needed to log"}
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading day">
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : !routine || !day ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button type="button" variant="outline" onClick={() => navigate("/programs")}>
              Back to routines
            </Button>
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">This day has no exercises yet</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/programs/${routineId}`)}
            >
              Edit the routine
            </Button>
          </div>
        ) : (
          <>
            <p className="flex-none px-1 text-xs leading-relaxed text-muted-foreground">
              Tap cells to adjust values before logging · uncheck rows to leave them out · blank
              cells copy your last workout
            </p>
            {exercises.map((re) => (
              <ExerciseCard
                key={re.id}
                mode="preview"
                exercise={toCardExercise(re, settings)}
                sets={previewSets(re)}
                collapsed={collapsedReIds.has(re.id)}
                visibleColumns={visibleColumns}
                onAction={handleCardAction(re)}
              />
            ))}
            <div className="h-4 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
