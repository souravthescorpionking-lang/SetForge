"use client";

// History tab: all past performances of this exercise, grouped by workout date
// (newest first). Each day offers "View Day" (jump the day view there) and
// "Copy Sets to Today" (bring that day's sets for this exercise into today's
// workout, then navigate to today).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CalendarDays, ClipboardCopy, MessageSquareText, Trophy } from "lucide-react";
import { exercisesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayLabel, relativeFromNow, setSummary } from "@/lib/client/format";
import type { ExerciseDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WarmupBadge } from "@/components/shared/warmup-badge";

type HistoryEntry = {
  workoutId: string;
  date: string;
  workoutExerciseId: string;
  sets: Array<{ id: string; newPr?: boolean; comment: string | null; weight: number | null; reps: number | null; distance: number | null; timeSec: number | null }>;
};

export function HistoryTab({
  exercise,
  currentWorkoutId,
  onNavigateDate,
  onCopySets,
}: {
  exercise: ExerciseDTO;
  currentWorkoutId: string;
  onNavigateDate: (dayKey: string) => void;
  onCopySets: (fromDate: string, setIds: string[]) => void | Promise<void>;
}) {
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const history = useQuery({
    queryKey: qk.exerciseHistory(exercise.id),
    queryFn: () => exercisesApi.history(exercise.id, 150),
    staleTime: 60_000,
  });

  if (history.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  const entries = [...(history.data ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No history yet — today is the first time you train this exercise.
      </div>
    );
  }

  const copy = async (entry: HistoryEntry) => {
    setCopyingId(entry.workoutExerciseId);
    try {
      await onCopySets(entry.date.slice(0, 10), entry.sets.map((s) => s.id));
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const dayKey = entry.date.slice(0, 10);
        const isCurrent = entry.workoutId === currentWorkoutId;
        const busy = copyingId === entry.workoutExerciseId;
        return (
          <section key={entry.workoutExerciseId} className="overflow-hidden rounded-2xl border bg-card">
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 border-b px-3 py-2.5",
                isCurrent ? "bg-primary/10" : "bg-muted/30",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{formatDayLabel(dayKey)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isCurrent ? "This workout" : relativeFromNow(entry.date)} · {entry.sets.length} sets
                </p>
              </div>
              {isCurrent ? (
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Open here
                </span>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 rounded-xl text-xs font-semibold"
                    onClick={() => onNavigateDate(dayKey)}
                    aria-label={`View the day ${dayKey}`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> View Day
                  </Button>
                  <Button
                    size="sm"
                    className="h-10 gap-1.5 rounded-xl text-xs font-bold"
                    disabled={busy}
                    onClick={() => void copy(entry)}
                    aria-label={`Copy sets from ${dayKey} to today`}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {busy ? "Copying…" : "Copy to Today"}
                  </Button>
                </div>
              )}
            </div>
            <ul className="divide-y divide-border/60">
              {entry.sets.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2.5 px-3 py-2">
                  {s.isWarmup ? (
                    <WarmupBadge className="h-6 w-6 text-[10px]" />
                  ) : (
                    <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                  )}
                  <span className={cn("numeric flex-1 truncate text-sm", s.isWarmup ? "text-muted-foreground" : "font-medium")}>
                    {setSummary(s)}
                  </span>
                  {s.newPr && <Trophy className="h-3.5 w-3.5 text-amber-500" aria-label="PR" />}
                  {s.comment && <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground/60" aria-label="comment" />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => history.refetch()}
      >
        Refresh history
      </Button>
    </div>
  );
}
