"use client";

// Track tab of the training screen: prefill, set inputs, save/update/delete,
// completion toggles, rest-timer auto-start and group auto-advance logic.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FileText, Star, Timer, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { exercisesApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { dayKeyOf, formatDayShort, round1, setSummary } from "@/lib/client/format";
import { fieldsForType } from "@/lib/constants";
import type { SetDTO, SettingsDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EMPTY_SET_VALUES, SetInputRow, type SetValues } from "./set-input-row";
import { PlateHint } from "./plate-hint";
import { WarmupPopover } from "./warmup-popover";
import { SetsList } from "./sets-list";
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

  const [values, setValues] = useState<SetValues>(EMPTY_SET_VALUES);
  const [selectedSet, setSelectedSet] = useState<SetDTO | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fav, setFav] = useState(ex.isFavorite);

  // prefill: first set of the last workout before this one
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

  // offer this exercise's default rest as a quick preset on the timer chip
  const setExtraPreset = restTimer.setExtraPreset;
  useEffect(() => {
    setExtraPreset(ex.restSec ?? null);
    return () => setExtraPreset(null);
  }, [ex.restSec, setExtraPreset]);

  const applyPrefill = (s: SetDTO | null | undefined) => {
    if (!s) {
      setValues(EMPTY_SET_VALUES);
      return;
    }
    setValues({
      weight: fields.includes("weight") ? s.weight : null,
      reps: fields.includes("reps") ? s.reps : null,
      distance: fields.includes("distance") ? s.distance : null,
      timeSec: fields.includes("timeSec") ? s.timeSec : null,
    });
  };

  useEffect(() => {
    if (dirty || selectedSet) return;
    applyPrefill(lastSets.data?.sets?.[0]);
  }, [lastSets.data]);

  const canSave = fields.some((f) => values[f] != null);

  const buildPayload = (isComplete: boolean) => ({
    weight: fields.includes("weight") ? values.weight ?? null : null,
    reps: fields.includes("reps") ? values.reps ?? null : null,
    distance: fields.includes("distance") ? values.distance ?? null : null,
    timeSec: fields.includes("timeSec") ? values.timeSec ?? null : null,
    isComplete,
  });

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

  const save = async () => {
    if (saving || (!canSave && !selectedSet)) return;
    setSaving(true);
    try {
      if (selectedSet) {
        const payload = { ...buildPayload(selectedSet.isComplete), comment: selectedSet.comment };
        const updated = await mutate({
          label: "Set updated",
          run: () => workoutsApi.updateSet(workout.id, we.id, selectedSet.id, payload),
          queue: {
            path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${selectedSet.id}`,
            method: "PATCH",
            body: payload,
          },
        });
        if (updated) toast.success("Set updated");
        setSelectedSet(null);
        setDirty(false);
        applyPrefill(lastSets.data?.sets?.[0]);
        return;
      }

      const payload = buildPayload(settings.markSetsComplete ? true : false);
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
          description: `${setSummary(created)} — best ever${created.reps ? ` for ${created.reps} reps` : ""}`,
        });
      } else {
        toast.success("Set saved");
      }

      // auto-start rest timer
      if (ex.restSec && ex.restSec > 0) restTimer.start(ex.restSec);
      else if (restTimer.everStarted) restTimer.start();

      maybeAdvance([...we.sets, created], created.id);
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setSelectedSet(null);
    setDirty(false);
    applyPrefill(lastSets.data?.sets?.[0]);
  };

  const selectSet = (set: SetDTO) => {
    if (selectedSet?.id === set.id) {
      setSelectedSet(null);
      setDirty(false);
      applyPrefill(lastSets.data?.sets?.[0]);
      return;
    }
    setSelectedSet(set);
    setValues({
      weight: set.weight,
      reps: set.reps,
      distance: set.distance,
      timeSec: set.timeSec,
    });
  };

  const toggleComplete = async (set: SetDTO) => {
    const next = !set.isComplete;
    const updated = await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(workout.id, we.id, set.id, { isComplete: next }),
      queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`, method: "PATCH", body: { isComplete: next } },
    });
    if (updated && next) {
      // treat a completion tick the same as a save — kick off the rest clock
      if (!set.isWarmup) {
        if (ex.restSec && ex.restSec > 0) restTimer.start(ex.restSec);
        else if (restTimer.everStarted) restTimer.start();
      }
      maybeAdvance(
        we.sets.map((s) => (s.id === set.id ? { ...s, isComplete: next } : s)),
        set.id,
      );
    }
  };

  const deleteSet = async (set: SetDTO) => {
    await mutate({
      label: "Set deleted",
      run: () => workoutsApi.removeSet(workout.id, we.id, set.id),
      queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`, method: "DELETE" },
    });
    toast.success("Set deleted");
    if (selectedSet?.id === set.id) clear();
  };

  const toggleWarmup = async (set: SetDTO) => {
    const next = !set.isWarmup;
    const updated = await mutate({
      label: next ? "Set marked as warm-up" : "Warm-up mark removed",
      run: () => workoutsApi.updateSet(workout.id, we.id, set.id, { isWarmup: next }),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`,
        method: "PATCH",
        body: { isWarmup: next },
      },
    });
    if (updated) {
      toast.success(next ? "Marked as warm-up — excluded from PRs & volume" : "Warm-up mark removed");
    }
  };

  const reorderSets = async (ids: string[]) => {
    await mutate({
      label: "Sets reordered",
      run: () => workoutsApi.reorderSets(workout.id, we.id, ids),
      queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/order`, method: "PUT", body: { ids } },
    });
  };

  const saveComment = async (setId: string, comment: string | null) => {
    await mutate({
      label: "Set comment saved",
      run: () => workoutsApi.updateSet(workout.id, we.id, setId, { comment }),
      queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${setId}`, method: "PATCH", body: { comment } },
    });
  };

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

  const estOneRm = records.data?.estimatedOneRm ?? 0;
  const showRm = fields.includes("weight") && fields.includes("reps") && estOneRm > 0;

  return (
    <div className="space-y-4">
      {/* exercise meta chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showRm && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Trophy className="h-3.5 w-3.5" /> e1RM <span className="numeric">{round1(estOneRm)}</span>kg
          </span>
        )}
        {ex.restSec ? (
          <button
            type="button"
            onClick={() => restTimer.start(ex.restSec!)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            aria-label={`Start ${ex.restSec} second rest timer`}
          >
            <Timer className="h-3.5 w-3.5" /> <span className="numeric">{ex.restSec}s</span> rest
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
        {lastSets.data?.date && !dirty && !selectedSet && (
          <span className="text-[11px] text-muted-foreground">
            prefill from {formatDayShort(dayKeyOf(lastSets.data.date))}
          </span>
        )}
      </div>

      {/* input card */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <SetInputRow
          fields={fields}
          values={values}
          onChange={(patch) => {
            setValues((v) => ({ ...v, ...patch }));
            setDirty(true);
          }}
          weightStep={ex.weightIncrement ?? settings.defaultWeightIncrement}
        />
        {fields.includes("weight") && (values.weight ?? 0) > 0 && (
          <PlateHint weight={values.weight!} unitSystem={settings.unitSystem} />
        )}
        <div className="flex gap-2">
          <Button
            size="lg"
            className="h-13 flex-1 rounded-xl text-base font-bold shadow-lg shadow-primary/25"
            disabled={saving || !canSave}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : selectedSet ? `Update Set ${selectedSet.sortOrder + 1}` : "Save Set"}
          </Button>
          {fields.includes("weight") && (values.weight ?? 0) > 0 && (
            <WarmupPopover
              targetWeight={values.weight!}
              step={ex.weightIncrement ?? settings.defaultWeightIncrement}
              disabled={saving}
              onLog={async (w, reps) => {
                const payload = { weight: w, reps, isComplete: true, isWarmup: true };
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
          )}
          <Button size="lg" variant="outline" className="h-13 rounded-xl px-4" onClick={clear} aria-label="Clear inputs">
            Clear
          </Button>
        </div>
        {selectedSet && (
          <p className="text-xs text-muted-foreground">
            Editing set {selectedSet.sortOrder + 1} — tap a row to switch, Clear to log a new set.
          </p>
        )}
      </div>

      {/* existing sets */}
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Sets <span className="numeric rounded-md bg-muted px-1.5 py-0.5">{we.sets.length}</span>
        </h4>
        <SetsList
          sets={we.sets}
          markSetsComplete={settings.markSetsComplete}
          selectedSetId={selectedSet?.id ?? null}
          onSelect={selectSet}
          onToggleComplete={(s) => void toggleComplete(s)}
          onSaveComment={(id, c) => void saveComment(id, c)}
          onReorder={(ids) => void reorderSets(ids)}
          onDelete={(s) => void deleteSet(s)}
          onToggleWarmup={(s) => void toggleWarmup(s)}
        />
      </div>
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
