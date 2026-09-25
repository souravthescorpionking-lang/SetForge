"use client";

// Move Workout dialog: move the whole day or just selected exercises to
// another date (creates/merges into the target day's workout).
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CalendarDays, Layers } from "lucide-react";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { addDaysKey, formatDayLong, formatDayLabel } from "@/lib/client/format";
import type { WorkoutDTO } from "@/lib/types";
import { toast } from "sonner";
import { dateToLocalKey, keyToLocalDate } from "./day-utils";

export function MoveWorkoutDialog({
  open,
  onOpenChange,
  workout,
  dateKey,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  dateKey: string;
  onMoved: (targetKey: string, whole: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const [targetKey, setTargetKey] = useState<string>(addDaysKey(dateKey, 1));
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedWe, setSelectedWe] = useState<Set<string>>(new Set());
  const [calOpen, setCalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetKey(addDaysKey(dateKey, 1));
      setMode("all");
      setSelectedWe(new Set());
    }
  }, [open, dateKey]);

  const exercises = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);

  const doMove = async () => {
    setBusy(true);
    try {
      const ids = mode === "selected" ? [...selectedWe] : undefined;
      if (mode === "selected" && selectedWe.size === 0) return;
      await workoutsApi.move(workout.id, { toDate: targetKey, workoutExerciseIds: ids });
      invalidate.workout(dateKey);
      invalidate.workout(targetKey);
      toast.success(
        mode === "all"
          ? `Workout moved to ${formatDayLabel(targetKey)}`
          : `Moved ${selectedWe.size} exercise${selectedWe.size > 1 ? "s" : ""} to ${formatDayLabel(targetKey)}`,
      );
      onOpenChange(false);
      onMoved(targetKey, mode === "all");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4.5 w-4.5 text-primary" /> Move workout
          </DialogTitle>
          <DialogDescription>{formatDayLong(dateKey)} → {formatDayLabel(targetKey)}</DialogDescription>
        </DialogHeader>

        <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 w-full justify-between rounded-xl font-semibold" aria-label="Pick target date">
                <span className="flex items-center gap-2 truncate">
                  <CalendarDays className="h-4 w-4 text-primary" /> To {formatDayLabel(targetKey)}
                </span>
                <span className="text-xs text-muted-foreground">change</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <Calendar
                mode="single"
                weekStartsOn={1}
                selected={keyToLocalDate(targetKey)}
                defaultMonth={keyToLocalDate(targetKey)}
                onSelect={(d) => {
                  if (!d) return;
                  setTargetKey(dateToLocalKey(d));
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "all" | "selected")} className="gap-2">
            <Label
              htmlFor="move-all"
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[button[data-state=checked]]:border-primary/50 has-[button[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id="move-all" value="all" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Whole workout</span>
                <span className="block text-xs text-muted-foreground">
                  {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · all sets, groups and notes
                </span>
              </span>
            </Label>
            <Label
              htmlFor="move-selected"
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[button[data-state=checked]]:border-primary/50 has-[button[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id="move-selected" value="selected" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Selected exercises only</span>
                <span className="block text-xs text-muted-foreground">{selectedWe.size} selected</span>
              </span>
            </Label>
          </RadioGroup>

          {mode === "selected" && (
            <ul className="space-y-1.5">
              {exercises.map((we) => (
                <li key={we.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border bg-card px-3 py-2 transition-colors hover:bg-accent/60">
                    <Checkbox
                      checked={selectedWe.has(we.id)}
                      onCheckedChange={() => {
                        const next = new Set(selectedWe);
                        if (next.has(we.id)) next.delete(we.id);
                        else next.add(we.id);
                        setSelectedWe(next);
                      }}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{we.exercise.name}</span>
                    <span className="numeric shrink-0 text-[11px] text-muted-foreground">{we.sets.length} sets</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/30 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="font-bold"
            disabled={busy || (mode === "selected" && selectedWe.size === 0) || (mode === "all" && targetKey === dateKey)}
            onClick={() => void doMove()}
          >
            {busy ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
