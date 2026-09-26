"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SelectedDayPanel — the inline replacement for the legacy day-sheet Dialog
// (p3-6: the Dialog is FORBIDDEN; day details expand inline below the grid).
//
//   48px data-row date header : "Thu 25 Sep · 4 sets · 5,400 kg" (computed —
//                               volume falls back to distance for cardio days)
//   ExerciseCard ×N           : summary mode one-liners; tap → expands inline
//                               to read mode with SetRows; tap again collapses;
//                               only ONE card expanded at a time.
//   empty day                 : one muted 48px data-row "Rest day".
//
// The workout detail comes from the shared byDate query cache (same key the
// legacy day-sheet used), so opening a day the List view already fetched is
// instant.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/client/store";
import { useWorkoutByDate } from "@/lib/client/query";
import { formatDayLabel, round2 } from "@/lib/client/format";
import { exerciseUnit } from "@/features/exercises/labels";
import type { SetDTO, WorkoutSummaryDTO, SettingsDTO, WorkoutExerciseDTO } from "@/lib/types";
import { ExerciseNotesPopover } from "@/features/today/card-popovers";

type Props = {
  dayKey: string;
  /** Month-index summary of the day (instant stats while the detail loads). */
  summary?: WorkoutSummaryDTO;
  visibleColumns: CardVisibleColumns;
};

/**
 * SetDTO → CardSet for read/summary rendering. NB: SetDTO.distance is stored
 * in KILOMETRES while CardSet.distanceM renders metres ("800 m" / "5 km") —
 * the mapper converts km→m so cardio days display "5 km", not "5 m".
 */
function toReadCardSets(sets: SetDTO[]): CardSet[] {
  return [...sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) =>
      toCardSet(
        { ...s, distance: s.distance != null ? s.distance * 1000 : null },
        i + 1,
      ),
    );
}

function toCardExercise(we: WorkoutExerciseDTO, settings: SettingsDTO | null): CardExercise {
  return {
    id: we.id,
    name: we.exercise.name,
    categoryLabel: we.exercise.category?.name ?? "Exercise",
    categoryColour: we.exercise.category?.colour ?? "#71717a",
    modality: we.exercise.type,
    unit: exerciseUnit(we.exercise, settings),
    weightIncrement: we.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  };
}

/** "Thu 25 Sep · 4 sets · 5,400 kg" — volume, or distance for cardio days. */
function headerStatsText(
  dayKey: string,
  stats: { sets: number; volume: number; distance: number } | null,
): string {
  if (!stats) return formatDayLabel(dayKey);
  const parts: string[] = [formatDayLabel(dayKey), `${stats.sets} ${stats.sets === 1 ? "set" : "sets"}`];
  if (stats.volume > 0) parts.push(`${Math.round(stats.volume).toLocaleString()} kg`);
  else if (stats.distance > 0) parts.push(`${round2(stats.distance)} km`);
  return parts.join(" · ");
}

export function SelectedDayPanel({ dayKey, summary, visibleColumns }: Props) {
  const settings = useApp((s) => s.settings);
  const navigate = useApp((s) => s.navigate);
  const { data, isLoading } = useWorkoutByDate(dayKey);
  const workout = data?.workout ?? null;

  // only ONE card expanded at a time (p3-6 spec)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesWeId, setNotesWeId] = useState<string | null>(null);

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );

  const stats = useMemo(() => {
    if (workout) {
      let volume = 0;
      let sets = 0;
      let distance = 0;
      for (const we of workout.exercises) {
        for (const s of we.sets) {
          sets++;
          volume += (s.weight ?? 0) * (s.reps ?? 0);
          distance += s.distance ?? 0;
        }
      }
      return { sets, volume, distance };
    }
    if (summary) return { sets: summary.setCount, volume: summary.volume, distance: summary.distance };
    return null;
  }, [workout, summary]);

  const handleCardAction =
    (we: WorkoutExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "open":
          // summary-mode header tap → expand inline; the read-mode ⋮ "Open"
          // item → the per-exercise focus screen (day context preserved).
          if (expandedId === we.id) navigate(`/today/${we.id}?date=${dayKey}`);
          else setExpandedId(we.id);
          break;
        case "toggle-collapse":
          setExpandedId((prev) => (prev === we.id ? null : we.id));
          break;
        case "notes":
          setNotesWeId(we.id);
          break;
        default:
          break; // read-only panel — no mutations here
      }
    };

  const notesWe = notesWeId ? exercises.find((we) => we.id === notesWeId) : null;

  return (
    <section className="flex flex-col gap-2" aria-label={`Selected day ${dayKey}`}>
      {/* 48px computed date header */}
      <h3
        data-row
        className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-sm font-semibold"
      >
        <span className="flex-none">{headerStatsText(dayKey, stats)}</span>
      </h3>

      {isLoading && !data ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : exercises.length > 0 ? (
        exercises.map((we) => (
          <div key={we.id} className="flex flex-col">
            <ExerciseCard
              mode={expandedId === we.id ? "read" : "summary"}
              exercise={toCardExercise(we, settings)}
              sets={toReadCardSets(we.sets)}
              visibleColumns={visibleColumns}
              onAction={handleCardAction(we)}
            />
            {notesWeId === we.id && notesWe ? (
              <div className="relative flex-none">
                <ExerciseNotesPopover
                  exercise={notesWe.exercise}
                  open
                  onClose={() => setNotesWeId(null)}
                />
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
        >
          Rest day
        </div>
      )}
    </section>
  );
}
