"use client";

// "Log All" preview dialog — the money feature of routines.
// Pick a target date, review the exercises (checkbox = include, unchecking
// skips an exercise), then log the whole day in one tap and jump to Today.
// Note: the API logs the entire day, so "skip" is implemented by removing the
// workout exercises this log run just created (pre-existing entries on the
// target date are never touched).
import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Copy, Loader2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryDot } from "@/components/shared/category-dot";
import { routinesApi, workoutsApi } from "@/lib/client/api";
import { formatDayLabel, formatDayLong, formatDayShort, setSummary, todayKey } from "@/lib/client/format";
import { useApp } from "@/lib/client/store";
import type { PredefinedSetDTO, RoutineDTO } from "@/lib/types";
import { toast } from "sonner";
import { useRoutineMutations, errorMessage } from "./use-routine-mutations";
import { GhostBadge } from "./bits";
import { cn } from "@/lib/utils";

type Props = {
  routine: RoutineDTO | null;
  /** The day to log — resolved fresh from the routine so preview stays in sync. */
  dayId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Day keys are UTC yyyy-mm-dd; convert to/from a local-midnight Date for the calendar.
const dayKeyToLocalDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const localDateToDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function LogAllDialog({ routine, dayId, open, onOpenChange }: Props) {
  const { online, invalidate } = useRoutineMutations();
  const navigate = useApp((s) => s.navigate);
  const [dateKey, setDateKey] = useState(todayKey());
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  const day = useMemo(() => routine?.days.find((d) => d.id === dayId) ?? null, [routine, dayId]);
  const exercises = useMemo(
    () => (day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [day],
  );
  const checkedCount = exercises.filter((re) => !skip.has(re.id)).length;

  // Reset per dialog open / target change.
  useEffect(() => {
    if (open) {
      setDateKey(todayKey());
      setSkip(new Set());
      setPending(false);
      setCalOpen(false);
    }
  }, [open, dayId]);

  const isExerciseBlank = (sets: PredefinedSetDTO[]) =>
    sets.length > 0 && sets.every((s) => s.weight == null && s.reps == null && s.distance == null && s.timeSec == null);

  const toggleSkip = (id: string) => {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doLog = async () => {
    if (!routine || !day || pending) return;
    setPending(true);
    try {
      const skippedExerciseIds = exercises.filter((re) => skip.has(re.id)).map((re) => re.exerciseId);

      // Best-effort guard: remember which workout exercises already existed on
      // the target date so the skip-removal below never deletes user-entered work.
      let preExisting = new Set<string>();
      if (skippedExerciseIds.length > 0) {
        try {
          const existing = await workoutsApi.byDate(dateKey);
          preExisting = new Set((existing.workout?.exercises ?? []).map((we) => we.id));
        } catch {
          /* best-effort only */
        }
      }

      const workout = await routinesApi.logDay(routine.id, { dayId: day.id, date: dateKey });

      for (const exerciseId of skippedExerciseIds) {
        const we = workout.exercises.find((e) => e.exerciseId === exerciseId);
        if (we && !preExisting.has(we.id)) {
          try {
            await workoutsApi.removeExercise(workout.id, we.id);
          } catch {
            /* best-effort skip removal */
          }
        }
      }

      invalidate.workout(dateKey);
      toast.success(`Logged ${checkedCount} exercise${checkedCount === 1 ? "" : "s"} to ${formatDayLabel(dateKey)}`);
      onOpenChange(false);
      navigate(`/today?date=${dateKey}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const allSkipped = exercises.length > 0 && checkedCount === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" aria-hidden />
            Log “{day?.name ?? "day"}”
          </DialogTitle>
          <DialogDescription>
            {routine?.name} · {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"} will be added to
            the chosen date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-4">
          {/* Target date */}
          <div className="flex items-center gap-2">
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 justify-start gap-2 font-normal" aria-label="Pick target date">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{formatDayLong(dateKey)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dayKeyToLocalDate(dateKey)}
                  onSelect={(d) => {
                    if (d) {
                      setDateKey(localDateToDayKey(d));
                      setCalOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            {dateKey !== todayKey() && (
              <Button variant="ghost" size="sm" onClick={() => setDateKey(todayKey())}>
                Today
              </Button>
            )}
          </div>

          {/* Preview tree */}
          <div className="scroll-slim max-h-[46vh] space-y-1.5 overflow-y-auto rounded-xl border bg-muted/25 p-2">
            {exercises.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">This day has no exercises yet.</p>
            )}
            {exercises.map((re) => {
              const checked = !skip.has(re.id);
              const blank = isExerciseBlank(re.sets);
              return (
                <div
                  key={re.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={checked}
                  aria-label={`Include ${re.exercise.name}`}
                  onClick={() => toggleSkip(re.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSkip(re.id);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent bg-background/70 px-2.5 py-2 transition-colors hover:border-border",
                    !checked && "opacity-50",
                  )}
                >
                  <span onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
                    <Checkbox
                      checked={checked}
                      aria-label={`Include ${re.exercise.name} when logging`}
                      onCheckedChange={() => toggleSkip(re.id)}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CategoryDot colour={re.exercise.category?.colour} size={8} />
                      <span className="truncate text-sm font-semibold">{re.exercise.name}</span>
                      <span className="numeric ml-auto shrink-0 text-xs text-muted-foreground">
                        {re.sets.length} {re.sets.length === 1 ? "set" : "sets"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {re.sets.length === 0 && (
                        <span className="text-xs text-muted-foreground">No predefined sets</span>
                      )}
                      {blank ? (
                        <GhostBadge>
                          <Copy className="h-3 w-3" aria-hidden /> will copy previous workout&rsquo;s sets
                        </GhostBadge>
                      ) : (
                        re.sets.map((s) => (
                          <Badge key={s.id} variant="secondary" className="numeric px-1.5 font-medium">
                            {setSummary(s)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {allSkipped && (
            <p className="text-center text-xs text-destructive">All exercises are skipped — nothing would be logged.</p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {checkedCount} of {exercises.length} selected
            {dateKey === todayKey() ? " · logging to today" : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            {online ? (
              <Button onClick={() => void doLog()} disabled={pending || checkedCount === 0} className="gap-1.5">
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Zap className="h-4 w-4" aria-hidden />
                )}
                Log to {formatDayShort(dateKey)}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled className="gap-1.5">
                      <Zap className="h-4 w-4" aria-hidden /> Log to {formatDayShort(dateKey)}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Requires connection</TooltipContent>
              </Tooltip>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
