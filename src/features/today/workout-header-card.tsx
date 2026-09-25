"use client";

// Workout summary header card: date, comment (inline edit dialog), timer status
// (ticking while active), volume/set chips and the workout actions menu.
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  CalendarDays,
  CheckSquare,
  ClipboardCopy,
  Clock,
  Dumbbell,
  Layers,
  MessageSquareText,
  MoreVertical,
  Play,
  Route,
  Square,
  Timer,
  Trash2,
  Flame,
} from "lucide-react";
import { useApp } from "@/lib/client/store";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { formatDayLabel, formatDayLong, isToday, round2 } from "@/lib/client/format";
import { totalVolume } from "@/lib/formulas";
import type { WorkoutDTO } from "@/lib/types";
import { toast } from "sonner";
import { useMutate } from "./use-mutate";

function useTicker(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDur(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${m}:${String(ss).padStart(2, "0")}`;
}

export function WorkoutHeaderCard({
  workout,
  dateKey,
  streak,
  onCopy,
  onMove,
  onEnterSelectMode,
}: {
  workout: WorkoutDTO;
  dateKey: string;
  streak?: number | null;
  onCopy: () => void;
  onMove: () => void;
  onEnterSelectMode: () => void;
}) {
  const invalidate = useInvalidate();
  const mutate = useMutate();
  const navigate = useApp((s) => s.navigate);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(workout.comment ?? "");

  const active = !!workout.startAt && !workout.endAt;
  useTicker(active);

  const sets = workout.exercises.flatMap((we) => we.sets);
  const doneSets = sets.filter((s) => s.isComplete);
  const volume = totalVolume(doneSets); // performed work only — planned sets don't count
  const distance = doneSets.reduce((sum, s) => sum + (s.distance ?? 0), 0);
  const durationSec =
    workout.startAt
      ? Math.max(
          0,
          ((workout.endAt ? new Date(workout.endAt).getTime() : Date.now()) - new Date(workout.startAt).getTime()) / 1000,
        )
      : 0;

  const saveComment = async () => {
    const comment = commentDraft.trim() || null;
    setCommentOpen(false);
    if (comment === (workout.comment ?? null)) return;
    await mutate({
      label: "Workout comment saved",
      run: () => workoutsApi.update(workout.id, { comment }),
      queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { comment } },
    });
    toast.success("Workout comment saved");
  };

  const toggleTimer = async () => {
    if (!workout.startAt || workout.endAt) {
      const startAt = new Date().toISOString();
      await mutate({
        label: "Workout timer started",
        run: () => workoutsApi.update(workout.id, { startAt }),
        queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { startAt } },
      });
      toast.success("Timer started", { icon: <Play className="h-4 w-4" /> });
    } else {
      const endAt = new Date().toISOString();
      await mutate({
        label: "Workout timer stopped",
        run: () => workoutsApi.update(workout.id, { endAt }),
        queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { endAt } },
      });
      toast.success("Timer stopped", { icon: <Square className="h-4 w-4" /> });
    }
  };

  const deleteWorkout = async () => {
    await mutate({
      label: "Workout deleted",
      run: () => workoutsApi.remove(workout.id),
      queue: { path: `/api/workouts/${workout.id}`, method: "DELETE" },
    });
    toast.success("Workout deleted");
    invalidate.workout(dateKey);
    navigate("/today");
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Workout summary">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
              <span className="truncate sm:hidden">{formatDayLabel(dateKey)}</span>
              <span className="hidden truncate sm:inline">{formatDayLong(dateKey)}</span>
              {isToday(dateKey) && (
                <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary-foreground shadow-sm">
                  Today
                </span>
              )}
            </h2>
            <button
              className="mt-0.5 flex min-h-6 max-w-full items-center gap-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setCommentDraft(workout.comment ?? "");
                setCommentOpen(true);
              }}
              aria-label="Edit workout comment"
            >
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
              <span className={workout.comment ? "truncate italic" : "truncate"}>
                {workout.comment || "Add comment…"}
              </span>
            </button>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl shrink-0" aria-label="Workout actions">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Workout actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => { setCommentDraft(workout.comment ?? ""); setCommentOpen(true); }}>
              <MessageSquareText className="h-4 w-4" /> Comment workout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void toggleTimer()}>
              {active ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {active ? "Stop timer" : workout.startAt ? "Restart timer" : "Start timer"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCopy}>
              <ClipboardCopy className="h-4 w-4" /> Copy workout…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <Layers className="h-4 w-4" /> Move workout…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEnterSelectMode}>
              <CheckSquare className="h-4 w-4" /> Delete exercises…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ConfirmDialog
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                  <Trash2 className="h-4 w-4" /> Delete workout
                </DropdownMenuItem>
              }
              title="Delete this workout?"
              description="All exercises, sets and comments logged for this day will be permanently removed."
              confirmLabel="Delete workout"
              onConfirm={() => void deleteWorkout()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {streak != null && streak > 0 && isToday(dateKey) && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
            title="Consecutive training days (all time)"
          >
            <Flame className="h-3.5 w-3.5" />
            <span className="numeric">{streak}</span>-day streak
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
          <Dumbbell className="h-3.5 w-3.5 text-primary" />
          <span className="numeric">{Math.round(volume).toLocaleString()}</span> kg done
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="numeric">{workout.exercises.length}</span> ex · <span className="numeric">{sets.length}</span> sets
        </span>
        {distance > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
            <Route className="h-3.5 w-3.5 text-primary" />
            <span className="numeric">{round2(distance)}</span> km
          </span>
        )}
        {(workout.startAt || workout.endAt) && (
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold " +
              (active ? "border border-primary/40 bg-primary/10 text-primary" : "border bg-muted/40")
            }
          >
            <Clock className="h-3.5 w-3.5" />
            {workout.startAt && <span className="numeric">{timeOf(workout.startAt)}</span>}
            {workout.endAt && <span className="numeric">– {timeOf(workout.endAt)}</span>}
            {durationSec > 0 && (
              <span className={"numeric " + (active ? "font-bold" : "text-muted-foreground")}>
                · {formatDur(durationSec)}
              </span>
            )}
          </span>
        )}
        {active && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
            <Timer className="h-3.5 w-3.5 animate-pulse" />
            <span className="numeric">{formatDur(durationSec)}</span>
          </span>
        )}
      </div>

      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workout comment</DialogTitle>
            <DialogDescription>A note for this whole day (e.g. “heavy deload week”).</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={3}
            value={commentDraft}
            placeholder="How did it go?"
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveComment();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveComment()}>Save comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
