"use client";

// History tab: sets grouped by workout date (newest first), PR date badges,
// per-day summary chips, and per-day actions (view / edit / copy-to-today).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate } from "@/lib/client/query";
import { exercisesApi, workoutsApi } from "@/lib/client/api";
import { dayKeyOf, formatDayLong, round1, round2, setSummary, todayKey } from "@/lib/client/format";
import { formatDuration, totalReps, totalVolume } from "@/lib/formulas";
import type { ExerciseDTO, SetDTO } from "@/lib/types";
import { ChevronDown, Copy, Eye, History, Loader2, Pencil, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { exerciseUnit } from "@/features/exercises/labels";
import { useOfflineRun } from "@/features/exercises/offline-run";

type Section = { key: string; workoutId: string; sets: SetDTO[] };

export function HistoryTab({ exercise }: { exercise: ExerciseDTO }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const unit = exerciseUnit(exercise, settings);

  const { data: entries, isLoading } = useQuery({
    queryKey: qk.exerciseHistory(exercise.id),
    queryFn: () => exercisesApi.history(exercise.id),
  });

  // records → date-level PR badges
  const { data: records } = useQuery({
    queryKey: qk.exerciseRecords(exercise.id),
    queryFn: () => exercisesApi.records(exercise.id),
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState<string | null>(null);

  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, Section>();
    for (const en of entries ?? []) {
      const key = dayKeyOf(en.date);
      const existing = map.get(key);
      if (existing) existing.sets.push(...en.sets);
      else map.set(key, { key, workoutId: en.workoutId, sets: [...en.sets] });
    }
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [entries]);

  const prDates = useMemo(
    () => new Set((records?.actual ?? []).map((r) => dayKeyOf(r.date))),
    [records],
  );

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const copyToToday = async (key: string, setIds: string[]) => {
    if (copying) return;
    setCopying(key);
    await run({
      label: "Copy sets",
      path: "/api/workouts",
      method: "POST",
      queueable: false, // needs the created workout id in the follow-up call
      run: async () => {
        const workout = await workoutsApi.createOrGet(todayKey());
        await workoutsApi.copy(workout.id, { fromDate: key, setIds });
      },
      successMsg: "Sets copied to today's workout",
      onDone: () => {
        invalidate.workout(todayKey());
        navigate("/today");
      },
    });
    setCopying(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="No history yet"
        description="Every set you log for this exercise appears here — grouped by workout day."
        action={
          <Button className="gap-1.5" onClick={() => navigate("/today")}>
            <Pencil className="h-4 w-4" /> Log a workout
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {sections.map((sec) => {
        const open = !collapsed.has(sec.key);
        const stats = dayStats(sec.sets);
        return (
          <motion.div
            key={sec.key}
            layout="position"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            <Card className="overflow-hidden rounded-2xl py-0 gap-0">
              <button
                type="button"
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40"
                onClick={() => toggle(sec.key)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold leading-tight">{formatDayLong(sec.key)}</span>
                    {prDates.has(sec.key) && (
                      <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
                        <Trophy className="h-3 w-3" /> PR
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <Chip>{sec.sets.length} set{sec.sets.length === 1 ? "" : "s"}</Chip>
                    {stats.volume != null && <Chip>vol {round1(stats.volume)} {unit}</Chip>}
                    {stats.reps != null && stats.reps > 0 && <Chip>{stats.reps} reps</Chip>}
                    {stats.distance != null && stats.distance > 0 && <Chip>{round2(stats.distance)} km</Chip>}
                    {stats.timeSec != null && stats.timeSec > 0 && <Chip>{formatDuration(stats.timeSec)}</Chip>}
                  </div>
                </div>
                <ChevronDown
                  className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-1.5 border-t bg-muted/20 p-3"
                  >
                    {sec.sets.map((s, i) => (
                      <div
                        key={s.id}
                        className="flex items-baseline gap-3 rounded-xl bg-background px-3 py-2.5"
                      >
                        <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground numeric">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold numeric">{setSummary(s)}</span>
                        {s.comment && (
                          <span className="max-w-[45%] truncate text-xs italic text-muted-foreground">{s.comment}</span>
                        )}
                      </div>
                    ))}

                    <div className="flex items-center gap-2 flex-wrap pt-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/today?date=${sec.key}`)}
                      >
                        <Eye className="h-3.5 w-3.5" /> View workout
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/today?date=${sec.key}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit sets
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={copying === sec.key}
                        onClick={() => void copyToToday(sec.key, sec.sets.map((s) => s.id))}
                      >
                        {copying === sec.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy to today
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        );
      })}
      {entries && entries.length >= 100 && (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Showing the most recent 100 sessions.
        </p>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground numeric">
      {children}
    </span>
  );
}

function dayStats(sets: SetDTO[]): {
  volume: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
} {
  const hasWR = sets.some((s) => s.weight != null && s.reps != null);
  const hasR = sets.some((s) => s.reps != null);
  const hasD = sets.some((s) => s.distance != null);
  const hasT = sets.some((s) => s.timeSec != null);
  return {
    volume: hasWR ? totalVolume(sets) : null,
    reps: hasR ? totalReps(sets) : null,
    distance: hasD ? sets.reduce((a, s) => a + (s.distance ?? 0), 0) : null,
    timeSec: hasT ? sets.reduce((a, s) => a + (s.timeSec ?? 0), 0) : null,
  };
}
