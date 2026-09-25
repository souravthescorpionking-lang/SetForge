"use client";

// Bottom sheet for a selected calendar day: workout summary + quick navigation.

import { useMemo, type ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { useWorkoutByDate, useApp } from "@/lib/client/query";
import { formatDayLong, round1 } from "@/lib/client/format";
import type { WorkoutDTO } from "@/lib/types";
import { Dumbbell, ChevronRight, CalendarPlus, MessageSquare, Flame, Layers, Timer } from "lucide-react";

type Props = {
  dayKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DaySheet({ dayKey, open, onOpenChange }: Props) {
  const { data, isLoading } = useWorkoutByDate(open ? (dayKey ?? undefined) : undefined);
  const navigate = useApp((s) => s.navigate);
  const workout = dayKey ? (data?.workout ?? null) : null;

  const stats = useMemo(() => workoutStats(workout), [workout]);

  const openDay = () => {
    if (!dayKey) return;
    onOpenChange(false);
    navigate(`/today?date=${dayKey}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[82vh]">
        <DrawerHeader className="pb-0">
          <DrawerTitle className="text-left">
            {dayKey ? formatDayLong(dayKey) : ""}
          </DrawerTitle>
          <DrawerDescription className="text-left">
            {workout ? "Workout day" : "No workout logged"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-slim p-4 space-y-4">
          {isLoading && !data && dayKey ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-40 rounded-lg" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : workout ? (
            <>
              {workout.comment && (
                <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 break-words">{workout.comment}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  icon={<Flame className="h-4 w-4" />}
                  label="Volume"
                  value={stats.volume > 0 ? `${round1(stats.volume)} kg` : "–"}
                />
                <StatTile icon={<Layers className="h-4 w-4" />} label="Sets" value={String(stats.sets)} />
                <StatTile
                  icon={<Timer className="h-4 w-4" />}
                  label="Exercises"
                  value={String(workout.exercises.length)}
                />
              </div>

              <ul className="space-y-1.5">
                {workout.exercises
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((we) => (
                    <li
                      key={we.id}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                    >
                      <CategoryDot colour={we.exercise.category?.colour} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{we.exercise.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="numeric">{we.sets.length}</span> set
                          {we.sets.length === 1 ? "" : "s"}
                          {we.exercise.category?.name ? ` · ${we.exercise.category.name}` : ""}
                        </p>
                      </div>
                      <Badge variant="secondary" className="numeric shrink-0">
                        {we.sets.length}×
                      </Badge>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={<CalendarPlus className="h-6 w-6" />}
              title="Rest day"
              description="Nothing logged for this date. Start a workout to fill it in."
              className="py-8"
            />
          )}
        </div>

        <DrawerFooter className="border-t pt-3">
          <div className="flex gap-2">
            <Button className="flex-1 gap-1.5" onClick={openDay}>
              {workout ? <ChevronRight className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
              {workout ? "Open Day" : "Log Workout"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2.5 text-center">
      <span className="mx-auto flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="numeric text-sm font-bold">{value}</span>
    </div>
  );
}

function workoutStats(w: WorkoutDTO | null): { volume: number; sets: number } {
  if (!w) return { volume: 0, sets: 0 };
  let volume = 0;
  let sets = 0;
  for (const we of w.exercises) {
    for (const s of we.sets) {
      sets++;
      volume += (s.weight ?? 0) * (s.reps ?? 0);
    }
  }
  return { volume, sets };
}
