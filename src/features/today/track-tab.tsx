"use client";

// Track tab of the training screen — now built on the Part 2 SetTable:
// one set = one inline-editable row. Keeps the prefill ghost, last-time
// context bar, warm-up ramp, rest auto-start, PR toasts, auto-advance and
// adds the volume summary line + keyboard shortcuts + undo toasts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileText, Star, Timer, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { exercisesApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { dayKeyOf, formatDayShort, round1 } from "@/lib/client/format";
import { estOneRm } from "@/lib/formulas";
import { fieldsForType } from "@/lib/constants";
import { exerciseUnit } from "@/features/exercises/labels";
import type { SetDTO, SettingsDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SetTable, type AddRowDraft } from "@/components/set-table/set-table";
import { PlateHint } from "./plate-hint";
import { WarmupPopover } from "./warmup-popover";
import { LastTimeBar } from "./last-time-bar";
import { useRestTimer } from "./rest-timer";
import { useMutate } from "./use-mutate";

type Props = {
  workout: WorkoutDTO;
  we: WorkoutExerciseDTO;
  settings: SettingsDTO;
  nextWe: WorkoutExerciseDTO | null;
  groupNextWe: WorkoutExerciseDTO | null;
  onSwitchExercise: (weId: string) => void;
};

export function TrackTab({ workout, we, settings, nextWe, groupNextWe, onSwitchExercise }: Props) {
  const ex = we.exercise;
  const fields = useMemo(() => fieldsForType(ex.type), [ex.type]);
  const mutate = useMutate();
  const invalidate = useInvalidate();
  const restTimer = useRestTimer();
  const unit = exerciseUnit(ex, settings);
  const weightStep = ex.weightIncrement ?? settings.defaultWeightIncrement;

  const [fav, setFav] = useState(ex.isFavorite);
  const [warmupAutoDone, setWarmupAutoDone] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddRowDraft>({ weight: null, reps: null, distance: null, timeSec: null });
  const lastTouchedId = useRef<string | null>(null);
  const [trackedWeId, setTrackedWeId] = useState(we.id);
  if (trackedWeId !== we.id) {
    // exercise switched → reset per-entry state without an effect cascade
    setTrackedWeId(we.id);
    setWarmupAutoDone(false);
  }

  // prefill ghost: last session's sets for this exercise
  const lastSets = useQuery({
    queryKey: qk.lastSets(ex.id, workout.date),
    queryFn: () => exercisesApi.lastSets(ex.id, workout.date),
    staleTime: 60_000,
  });
  const records = useQuery({
    queryKey: qk.exerciseRecords(ex.id),
    queryFn: () => exercisesApi.records(ex.id),
    staleTime: 60_000,
  });

  const setExtraPreset = restTimer.setExtraPreset;
  useEffect(() => {
    setExtraPreset(ex.restSec ?? null);
    return () => setExtraPreset(null);
  }, [ex.restSec, setExtraPreset]);

  const ghostSet = lastSets.data?.sets?.find((s) => !s.isWarmup) ?? null;

  /** Auto-advance: group → jump to next exercise in the group (wrapping);
   *  ungrouped → offer "Next exercise?" once every set is complete. */
  const maybeAdvance = (setsSnapshot: SetDTO[], changedId: string) => {
    const sorted = [...setsSnapshot].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === changedId);
    if (idx < 0 || idx !== sorted.length - 1) return; // not the final set
    const allComplete = sorted.every((s) => s.isComplete);
    if (we.groupId && groupNextWe && groupNextWe.id !== we.id) {
      if (!settings.markSetsComplete || allComplete) {
        toast(`→ Next: ${groupNextWe.exercise.name}`, {
          icon: <Zap className="h-4 w-4 text-primary" />,
          description: "Superset flow",
        });
        onSwitchExercise(groupNextWe.id);
      }
      return;
    }
    if (settings.markSetsComplete && allComplete && nextWe) {
      toast("All sets complete 💪", {
        action: {
          label: "Next exercise",
          onClick: () => onSwitchExercise(nextWe.id),
        },
      });
    }
  };

  // ---------- set mutations ----------

  const patchSet = async (id: string, patch: Record<string, unknown>) => {
      lastTouchedId.current = id;
      await mutate({
        label: "Set updated",
        run: () => workoutsApi.updateSet(workout.id, we.id, id, patch),
        queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${id}`, method: "PATCH", body: patch },
      });
    };

  const addSet = async (values: {
      weight: number | null;
      reps: number | null;
      distance: number | null;
      timeSec: number | null;
      setType?: string;
      rpe?: number | null;
      tempo?: string | null;
      restPlannedSec?: number | null;
      isComplete?: boolean;
    }) => {
      const payload = {
        weight: fields.includes("weight") ? values.weight ?? null : null,
        reps: fields.includes("reps") ? values.reps ?? null : null,
        distance: fields.includes("distance") ? values.distance ?? null : null,
        timeSec: fields.includes("timeSec") ? values.timeSec ?? null : null,
        setType: values.setType ?? "NORMAL",
        rpe: values.rpe ?? null,
        tempo: values.tempo ?? null,
        restPlannedSec: values.restPlannedSec ?? null,
        isComplete: values.isComplete ?? false,
      };
      const created = await mutate({
        label: "Set saved",
        run: () => workoutsApi.addSet(workout.id, we.id, payload),
        queue: {
          path: `/api/workouts/${workout.id}/exercises/${we.id}/sets`,
          method: "POST",
          body: payload,
        },
      });
      if (!created) return; // queued offline

      if (created.newPr) {
        toast.success("New personal record!", {
          icon: <Trophy className="h-4 w-4 text-amber-500" />,
          description: `${created.reps} reps at ${created.weight} — best ever`,
        });
      } else {
        toast.success("Set saved");
      }

      // auto-start rest from the row's planned rest (setting-gated)
      if (settings.autoRestFromRow) {
        const rest = created.restPlannedSec ?? ex.restSec ?? null;
        if (rest && rest > 0) restTimer.start(rest, created.id);
        else if (restTimer.everStarted) restTimer.start(undefined, created.id);
      } else if (restTimer.everStarted) {
        restTimer.start(undefined, created.id);
      }

      maybeAdvance([...we.sets, created], created.id);
    };

  const deleteSet = async (set: SetDTO) => {
      lastTouchedId.current = set.id;
      await mutate({
        label: "Set deleted",
        run: () => workoutsApi.removeSet(workout.id, we.id, set.id),
        queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`, method: "DELETE" },
      });
      // undo toast — recreate the set with all its fields
      toast("Set deleted", {
        description: `${set.weight ?? "–"}${unit} × ${set.reps ?? "–"}`,
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => {
            void addSet({
              weight: set.weight,
              reps: set.reps,
              distance: set.distance,
              timeSec: set.timeSec,
              setType: set.setType ?? "NORMAL",
              rpe: set.rpe ?? null,
              tempo: set.tempo ?? null,
              restPlannedSec: set.restPlannedSec ?? null,
            });
          },
        },
      });
    };

  const duplicateSet = async (set: SetDTO) => {
      lastTouchedId.current = set.id;
      await addSet({
        weight: set.weight,
        reps: set.reps,
        distance: set.distance,
        timeSec: set.timeSec,
        setType: set.setType ?? "NORMAL",
        rpe: set.rpe ?? null,
        tempo: set.tempo ?? null,
        restPlannedSec: set.restPlannedSec ?? null,
      });
      toast.success("Set duplicated");
    };

  const toggleComplete = async (set: SetDTO) => {
      lastTouchedId.current = set.id;
      const next = !set.isComplete;
      const updated = await mutate({
        label: "Set updated",
        run: () => workoutsApi.updateSet(workout.id, we.id, set.id, { isComplete: next }),
        queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`, method: "PATCH", body: { isComplete: next } },
      });
      if (updated && next) {
        // ticking ✓ starts the rest clock (warm-ups excluded)
        if (set.setType !== "WARMUP" && !set.isWarmup) {
          if (settings.autoRestFromRow) {
            const rest = set.restPlannedSec ?? ex.restSec ?? null;
            if (rest && rest > 0) restTimer.start(rest, set.id);
            else if (restTimer.everStarted) restTimer.start(undefined, set.id);
          } else if (restTimer.everStarted) {
            restTimer.start(undefined, set.id);
          }
        }
        maybeAdvance(
          we.sets.map((s) => (s.id === set.id ? { ...s, isComplete: next } : s)),
          set.id,
        );
      }
    };

  const reorderSets = useCallback(
    async (ids: string[]) => {
      await mutate({
        label: "Sets reordered",
        run: () => workoutsApi.reorderSets(workout.id, we.id, ids),
        queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/order`, method: "PUT", body: { ids } },
      });
    },
    [mutate, workout.id, we.id],
  );

  const toggleFav = async () => {
    const next = !fav;
    setFav(next);
    await mutate({
      label: "Favorite updated",
      run: () => exercisesApi.update(ex.id, { isFavorite: next }),
      queue: { path: `/api/exercises/${ex.id}`, method: "PATCH", body: { isFavorite: next } },
    });
    invalidate.exercises();
  };

  // ---------- summary line (Vol / best e1RM / avg RPE) ----------

  const summary = useMemo(() => {
    const done = we.sets.filter((s) => s.isComplete && !s.isWarmup && (s.setType ?? "NORMAL") !== "WARMUP");
    let volume = 0;
    let bestE1rm = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let setCount = 0;
    for (const s of done) {
      setCount++;
      volume += (s.weight ?? 0) * (s.reps ?? 0);
      if (s.weight != null && s.reps != null && s.reps >= 1 && s.reps <= 10 && (s.setType ?? "NORMAL") !== "FAILURE") {
        bestE1rm = Math.max(bestE1rm, estOneRm(s.weight, s.reps));
      }
      if (s.rpe != null) {
        rpeSum += s.rpe;
        rpeCount++;
      }
    }
    return {
      setCount,
      volume,
      bestE1rm: bestE1rm > 0 ? round1(bestE1rm) : null,
      avgRpe: rpeCount > 0 ? round1(rpeSum / rpeCount) : null,
    };
  }, [we.sets]);

  // ---------- rest-end behaviour: focus the add row for the next set ----------

  useEffect(() => {
    if (settings.restEndBehaviour !== "NOTIFY_AND_FOCUS_NEXT") return;
    return restTimer.onRestEnd(() => {
      setFocusSignal((n) => n + 1);
    });
  }, [settings.restEndBehaviour, restTimer]);

  // ---------- keyboard shortcuts (desktop) ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setFocusSignal((n) => n + 1);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        restTimer.start(ex.restSec ?? undefined);
      } else if ((e.key === "Delete" || e.key === "Backspace") && lastTouchedId.current) {
        const s = we.sets.find((x) => x.id === lastTouchedId.current);
        if (s) {
          e.preventDefault();
          void deleteSet(s);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ex.restSec, restTimer, we.sets, deleteSet]);

  const estOneRmVal = records.data?.estimatedOneRm ?? 0;
  const showRm = fields.includes("weight") && fields.includes("reps") && estOneRmVal > 0;
  const hasLoggedWork = we.sets.some(
    (s) => !s.isWarmup && (s.weight != null || s.reps != null || s.distance != null || s.timeSec != null),
  );
  const warmupAutoOpen = !!ex.autoWarmup && !warmupAutoDone && !hasLoggedWork;
  const warmupTarget = ghostSet?.weight ?? we.sets.find((s) => !s.isWarmup && s.weight != null)?.weight ?? null;

  return (
    <div className="space-y-3.5">
      {/* exercise meta chips + summary line */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showRm && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Trophy className="h-3.5 w-3.5" /> e1RM <span className="tabular-nums">{round1(estOneRmVal)}</span>kg
          </span>
        )}
        {ex.restSec ? (
          <button
            type="button"
            onClick={() => restTimer.start(ex.restSec!)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            aria-label={`Start ${ex.restSec} second rest timer`}
          >
            <Timer className="h-3.5 w-3.5" /> <span className="tabular-nums">{ex.restSec}s</span> rest
          </button>
        ) : null}
        {ex.notes && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Exercise notes"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
              >
                <FileText className="h-3.5 w-3.5" /> notes
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-sm text-sm leading-relaxed whitespace-pre-wrap" align="start">
              <LinkedNotes notes={ex.notes} />
            </PopoverContent>
          </Popover>
        )}
        <button
          type="button"
          onClick={() => void toggleFav()}
          aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={fav}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-accent"
        >
          <Star className={cn("h-4 w-4", fav ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
        </button>
        <span className="flex-1" />
        {lastSets.data?.date && (
          <span className="text-[11px] text-muted-foreground">
            prefill from {formatDayShort(dayKeyOf(lastSets.data.date))}
          </span>
        )}
      </div>

      {/* volume / e1RM / avg RPE summary line */}
      {summary.setCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/40 px-3 py-1.5 text-xs">
          <span className="font-semibold tabular-nums">
            Vol <span className="text-primary">{summary.volume >= 1000 ? `${round1(summary.volume / 1000)}k` : round1(summary.volume)}</span> {unit}
          </span>
          {summary.bestE1rm != null && (
            <span className="font-semibold tabular-nums">
              Best e1RM <span className="text-primary">{summary.bestE1rm}</span>
            </span>
          )}
          {summary.avgRpe != null && (
            <span className="font-semibold tabular-nums">
              Avg RPE <span className="text-primary">{summary.avgRpe}</span>
            </span>
          )}
          <span className="tabular-nums text-muted-foreground">{summary.setCount} working sets</span>
        </div>
      )}

      {/* beat-last-time context */}
      {(lastSets.data?.sets?.length || lastSets.data?.date === null) && (
        <LastTimeBar
          date={lastSets.data?.date ?? null}
          sets={lastSets.data?.sets ?? []}
          fields={fields}
          weight={addDraft.weight}
          reps={addDraft.reps}
          distance={addDraft.distance}
          timeSec={addDraft.timeSec}
          todaySets={we.sets}
          onApplySet={(s) => {
            setAddDraft({
              weight: fields.includes("weight") ? s.weight : null,
              reps: fields.includes("reps") ? s.reps : null,
              distance: fields.includes("distance") ? s.distance : null,
              timeSec: fields.includes("timeSec") ? s.timeSec : null,
            });
            setFocusSignal((n) => n + 1);
          }}
        />
      )}

      {/* the Part 2 set table */}
      <div className="rounded-2xl border bg-card p-2.5 shadow-sm sm:p-3">
        <SetTable
          sets={we.sets}
          exerciseType={ex.type}
          cols={{
            setType: settings.showSetType,
            rpe: settings.showRpe,
            tempo: settings.showTempo,
            rest: settings.showRest,
          }}
          weightStep={weightStep}
          unit={unit}
          ghost={
            ghostSet
              ? {
                  weight: ghostSet.weight,
                  reps: ghostSet.reps,
                  distance: ghostSet.distance,
                  timeSec: ghostSet.timeSec,
                  rpe: ghostSet.rpe ?? null,
                  tempo: ghostSet.tempo ?? null,
                  restPlannedSec: ghostSet.restPlannedSec ?? null,
                }
              : null
          }
          defaults={{
            setType: ex.defaultSetType ?? null,
            rpe: ex.defaultRpeTarget ?? null,
            tempo: ex.defaultTempo ?? null,
            restPlannedSec: ex.restSec ?? null,
          }}
          restRowId={restTimer.restRowId}
          restRemainingSec={restTimer.remainingSec}
          markSetsComplete={settings.markSetsComplete}
          onPatchSet={(id, patch) => void patchSet(id, patch)}
          onAddSet={addSet}
          onDuplicateSet={(s) => void duplicateSet(s)}
          onDeleteSet={(s) => void deleteSet(s)}
          onReorder={(ids) => void reorderSets(ids)}
          onStartRest={(sec, setId) => restTimer.start(sec, setId)}
          onToggleComplete={(s) => void toggleComplete(s)}
          onUseAsPrefill={() => setFocusSignal((n) => n + 1)}
          focusSignal={focusSignal}
          draft={addDraft}
          onDraftChange={setAddDraft}
        />
        <p className="mt-2 hidden items-center gap-1.5 px-1 text-[11px] text-muted-foreground lg:flex">
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-bold">N</kbd>
          new set
          <kbd className="ml-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-bold">R</kbd>
          rest
          <kbd className="ml-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-bold">?</kbd>
          all shortcuts
        </p>
      </div>

      {/* plate hint for the ghost/last weight */}
      {fields.includes("weight") && warmupTarget != null && warmupTarget > 0 && (
        <PlateHint weight={warmupTarget} unitSystem={settings.unitSystem} />
      )}

      {/* warm-up ramp */}
      {fields.includes("weight") && warmupTarget != null && warmupTarget > 0 && (
        <div className="flex justify-center">
          <WarmupPopover
            targetWeight={warmupTarget}
            step={weightStep}
            disabled={false}
            autoOpen={warmupAutoOpen}
            onAutoOpened={() => setWarmupAutoDone(true)}
            onLog={async (w, reps) => {
              const payload = { weight: w, reps, isComplete: true, isWarmup: true, setType: "WARMUP" };
              await mutate({
                label: "Warm-up set logged",
                run: () => workoutsApi.addSet(workout.id, we.id, payload),
                queue: {
                  path: `/api/workouts/${workout.id}/exercises/${we.id}/sets`,
                  method: "POST",
                  body: payload,
                },
              });
              toast.success(`Warm-up: ${w}kg × ${reps}`);
            }}
          />
        </div>
      )}

      {/* keyboard shortcuts sheet */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
          <ul className="space-y-2 text-sm">
            {[
              ["N", "Focus the new-set row"],
              ["R", "Start the rest timer"],
              ["Enter", "Commit cell · on last value adds the set"],
              ["Tab", "Move to the next cell"],
              ["↑ / ↓", "Step the focused value ± increment"],
              ["Del", "Delete the last touched set (undo available)"],
              ["?", "Toggle this sheet"],
            ].map(([k, d]) => (
              <li key={k} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{d}</span>
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-sans text-xs font-bold">{k}</kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Renders note text with http(s) links turned into anchors. */
function LinkedNotes({ notes }: { notes: string }) {
  const parts = notes.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <span>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className="break-all font-medium text-primary underline underline-offset-2"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
