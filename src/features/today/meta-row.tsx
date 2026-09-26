"use client";

// MetaRow — the 48px data-row above the exercise cards: duration chip (live
// elapsed session timer, reusing the legacy workout-header-card logic — tap to
// start/stop/restart), rest chip (live countdown mini while rest runs), note
// chip (anchored popover editor for the workout comment; ghost "Add note").
// All chips single-line; the row uses the rowTall token (48px, nowrap).

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareText, Play, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { rowTall } from "@/lib/ui/tokens";
import { formatDuration } from "@/lib/formulas";
import { workoutsApi } from "@/lib/client/api";
import type { WorkoutDTO } from "@/lib/types";
import { useMutate } from "./use-mutate";

/** 1 Hz re-render while the session timer runs (legacy useTicker). */
function useTicker(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

const chipBase =
  "flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors";

export function MetaRow({
  workout,
  restRemainingSec,
  onToggleTimer,
}: {
  workout: WorkoutDTO;
  /** Live rest countdown seconds (null while idle). */
  restRemainingSec: number | null;
  /** Start/stop/restart the session timer (legacy toggleTimer logic). */
  onToggleTimer: () => void;
}) {
  const mutate = useMutate();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const active = !!workout.startAt && !workout.endAt;
  useTicker(active);

  const durationSec = workout.startAt
    ? Math.max(
        0,
        ((workout.endAt ? new Date(workout.endAt).getTime() : Date.now()) -
          new Date(workout.startAt).getTime()) /
          1000,
      )
    : 0;

  const timerLabel = !workout.startAt
    ? "Start workout timer"
    : active
      ? "Stop workout timer"
      : "Restart workout timer";

  const saveNote = async () => {
    setNoteOpen(false);
    const comment = noteDraft.trim() || null;
    if (comment === (workout.comment ?? null)) return;
    await mutate({
      label: "Workout note saved",
      run: () => workoutsApi.update(workout.id, { comment }),
      queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { comment } },
    });
    toast.success("Workout note saved");
  };

  return (
    <div data-row className={cn(rowTall, "gap-2 px-1")}>
      {/* duration — live elapsed session timer */}
      <button
        type="button"
        onClick={onToggleTimer}
        aria-label={timerLabel}
        title={timerLabel}
        className={cn(
          chipBase,
          "flex-none hover:bg-accent",
          active && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {active ? (
          <Timer className="h-3.5 w-3.5 flex-none animate-pulse" aria-hidden />
        ) : workout.startAt ? (
          <Square className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
        ) : (
          <Play className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
        )}
        {workout.startAt ? (
          <span>{formatDuration(durationSec)}</span>
        ) : (
          <span className="text-muted-foreground/70">–:–</span>
        )}
      </button>

      {/* rest countdown mini (only while a rest runs) */}
      {restRemainingSec != null && (
        <span className={cn(chipBase, "flex-none border-primary/40 bg-primary/10 font-bold text-primary")}>
          <Timer className="h-3.5 w-3.5 flex-none" aria-hidden />
          Rest {formatDuration(restRemainingSec)}
        </span>
      )}

      {/* workout note — anchored popover editor */}
      <Popover
        open={noteOpen}
        onOpenChange={(o) => {
          if (o) setNoteDraft(workout.comment ?? "");
          setNoteOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              chipBase,
              "min-w-0 flex-1 justify-start hover:bg-accent",
              !workout.comment && "border-dashed text-muted-foreground/70",
            )}
            aria-label={workout.comment ? "Edit workout note" : "Add a workout note"}
          >
            <MessageSquareText className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
            <span className="truncate text-left font-medium italic">
              {workout.comment || "Add note"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Workout note
          </p>
          <Textarea
            autoFocus
            rows={3}
            value={noteDraft}
            placeholder="How did it go?"
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveNote();
            }}
            className="mt-2"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void saveNote()}>
              Save note
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
