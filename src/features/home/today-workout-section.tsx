"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodayWorkoutSection — section E of the Home dashboard (Part 5).
//
// 32px header "Today's workout"; when a workout exists for the server's today
// the day's exercises render through the ONE ExerciseCard in summary mode
// (read-only list, max-h-96 overflow-y-auto with the custom scrollbar);
// otherwise a single 40px muted row "Nothing logged yet".
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import {
  ExerciseCard,
  toCardSet,
  type CardExercise,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { useApp } from "@/lib/client/store";
import { useWorkoutByDate } from "@/lib/client/query";
import { exerciseUnit } from "@/features/exercises/labels";
import type { WorkoutExerciseDTO } from "@/lib/types";

export function TodayWorkoutSection({
  dateKey,
  hasWorkout,
  visibleColumns,
}: {
  /** The SERVER's today (dashboard.today.date) — never client-computed. */
  dateKey: string;
  /** Whether the dashboard reports a workout for today (drives the empty row). */
  hasWorkout: boolean;
  visibleColumns: CardVisibleColumns;
}) {
  const settings = useApp((s) => s.settings);
  const { data } = useWorkoutByDate(dateKey);
  const workout = data?.workout ?? null;

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );

  const toCardExercise = (we: WorkoutExerciseDTO): CardExercise => ({
    id: we.id,
    name: we.exercise.name,
    categoryLabel: we.exercise.category?.name ?? "Exercise",
    categoryColour: we.exercise.category?.colour ?? "#71717a",
    modality: we.exercise.type,
    unit: exerciseUnit(we.exercise, settings),
    weightIncrement: we.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  });

  return (
    <section aria-label="Today's workout" className="flex flex-none flex-col gap-2">
      <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">Today&apos;s workout</span>
      </p>
      {hasWorkout && exercises.length > 0 ? (
        <div
          className="scroll-slim flex max-h-96 flex-col gap-2 overflow-y-auto"
          aria-label="Exercises logged today"
        >
          {exercises.map((we) => (
            <ExerciseCard
              key={we.id}
              mode="summary"
              exercise={toCardExercise(we)}
              sets={[...we.sets]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s, i) =>
                  toCardSet({ ...s, distance: s.distance != null ? s.distance * 1000 : null }, i + 1),
                )}
              visibleColumns={visibleColumns}
            />
          ))}
        </div>
      ) : (
        <div
          data-row
          className="flex h-10 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
        >
          Nothing logged yet
        </div>
      )}
    </section>
  );
}
