"use client";

// Copy Workout dialog: pick a source date → inspect that day's sets →
// choose which sets to copy into the current workout.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ClipboardCopy } from "lucide-react";
import { workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { addDaysKey, formatDayLabel } from "@/lib/client/format";
import type { WorkoutDTO } from "@/lib/types";
import { toast } from "sonner";
import { SetTree } from "./set-tree";
import { dateToLocalKey, keyToLocalDate } from "./day-utils";

export function CopyWorkoutDialog({
  open,
  onOpenChange,
  workout,
  dateKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  dateKey: string;
}) {
  const invalidate = useInvalidate();
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // most recent workout strictly before the target date → default source
  const previous = useQuery({
    queryKey: qk.workoutList({ to: addDaysKey(dateKey, -1), limit: 5 }),
    queryFn: () => workoutsApi.list({ to: addDaysKey(dateKey, -1) }),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (open && sourceKey === null && previous.data) {
      const first = previous.data.workouts[0];
      setSourceKey(first ? first.date.slice(0, 10) : null);
    }
    if (!open) {
      setSourceKey(null);
      setSelected(new Set());
    }
  }, [open, previous.data]);

  // load the chosen source workout
  const source = useQuery({
    queryKey: qk.workoutByDate(sourceKey ?? ""),
    queryFn: () => workoutsApi.byDate(sourceKey!),
    enabled: open && !!sourceKey,
  });

  const sourceWorkout = source.data?.workout ?? null;
  const sortedExercises = useMemo(
    () => (sourceWorkout ? [...sourceWorkout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [sourceWorkout],
  );

  // default: everything selected
  useEffect(() => {
    if (sourceWorkout) {
      setSelected(new Set(sourceWorkout.exercises.flatMap((we) => we.sets.map((s) => s.id))));
    }
  }, [sourceWorkout?.id]);

  const doCopy = async () => {
    if (!sourceKey || selected.size === 0) return;
    setBusy(true);
    try {
      await workoutsApi.copy(workout.id, { fromDate: sourceKey, setIds: [...selected] });
      invalidate.workout(dateKey);
      toast.success(`Copied ${selected.size} set${selected.size > 1 ? "s" : ""} from ${formatDayLabel(sourceKey)}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusy(false);
    }
  };

  const hasAnyPrevious = (previous.data?.workouts.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCopy className="h-4.5 w-4.5 text-primary" /> Copy into this workout
          </DialogTitle>
          <DialogDescription>Bring sets from an earlier day into {formatDayLabel(dateKey)}.</DialogDescription>
        </DialogHeader>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 w-full justify-between rounded-xl font-semibold" aria-label="Pick source date">
                <span className="flex items-center gap-2 truncate">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {sourceKey ? `From ${formatDayLabel(sourceKey)}` : "No earlier workouts"}
                </span>
                <span className="text-xs text-muted-foreground">change</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <Calendar
                mode="single"
                weekStartsOn={1}
                disabled={(d) => dateToLocalKey(d) >= dateKey}
                selected={sourceKey ? keyToLocalDate(sourceKey) : undefined}
                defaultMonth={sourceKey ? keyToLocalDate(sourceKey) : keyToLocalDate(addDaysKey(dateKey, -7))}
                onSelect={(d) => {
                  if (!d) return;
                  setSourceKey(dateToLocalKey(d));
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          {!hasAnyPrevious && previous.isSuccess && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              You have no workouts before this date — log a session first, then copy it forward.
            </p>
          )}
          {source.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          )}
          {sourceWorkout && <SetTree exercises={sortedExercises} selected={selected} onChange={setSelected} />}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/30 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="font-bold"
            disabled={!sourceKey || selected.size === 0 || busy}
            onClick={() => void doCopy()}
          >
            {busy ? "Copying…" : `Copy ${selected.size > 0 ? selected.size : ""} set${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
