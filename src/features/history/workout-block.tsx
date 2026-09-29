"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WorkoutBlock — one workout of the History timeline (p3-6), in the Calendar's
// DateGroup language + the ONE ExerciseCard:
//
//   DateGroup header : 32px (h-8) — "Fri 25 Sep" + truncated comment/hairline
//   summary row      : 48px data-row — volume · sets · duration (cardio days
//                      fall back to distance), computed from the summary DTO
//   ExerciseCard ×N  : read mode, collapsed by default — tap the card (or its
//                      chevron) to expand the SetRows inline; PR/note markers
//                      render from SetDTO (newPr/comment via toCardSet)
//
// The full workout tree is fetched through the SHARED byDate query cache (the
// same key the Calendar panel uses), so days visited anywhere else in the app
// render instantly here.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState } from "react";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { useWorkoutByDate } from "@/lib/client/query";
import { dayKeyOf, formatDayLabel, formatSec, round2 } from "@/lib/client/format";
import { exerciseUnit } from "@/features/exercises/labels";
import type { SetDTO, SettingsDTO, WorkoutExerciseDTO, WorkoutSummaryDTO } from "@/lib/types";
import { ExerciseNotesPopover } from "@/features/today/card-popovers";

/**
 * SetDTO → CardSet. NB: SetDTO.distance is KILOMETRES while CardSet.distanceM
 * renders metres ("800 m" / "5 km") — converted here so cardio days show
 * "6.5 km", not "6.5 m".
 */
function toReadCardSets(sets: SetDTO[]): CardSet[] {
  return [...sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) =>
      toCardSet({ ...s, distance: s.distance != null ? s.distance * 1000 : null }, i + 1),
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

/** "1,258 kg · 14 sets · 48:12" — volume, or distance when there is none. */
function summaryText(w: WorkoutSummaryDTO): string[] {
  const parts: string[] = [];
  if (w.volume > 0) parts.push(`${Math.round(w.volume).toLocaleString()} kg`);
  else if (w.distance > 0) parts.push(`${round2(w.distance)} km`);
  parts.push(`${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`);
  if (w.durationSec > 0) parts.push(formatSec(w.durationSec));
  return parts;
}

export function WorkoutBlock({
  summary,
  visibleColumns,
}: {
  summary: WorkoutSummaryDTO;
  visibleColumns: CardVisibleColumns;
}) {
  const settings = useApp((s) => s.settings);
  const navigate = useApp((s) => s.navigate);
  const dayKey = dayKeyOf(summary.date);
  const { data, isLoading } = useWorkoutByDate(dayKey);
  const workout = data?.workout ?? null;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesWeId, setNotesWeId] = useState<string | null>(null);

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );

  const handleCardAction =
    (we: WorkoutExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "toggle-collapse":
          setExpandedId((prev) => (prev === we.id ? null : we.id));
          break;
        case "open":
          // read-mode ⋮ "Open" → per-exercise focus screen with day context
          navigate(`/today/${we.id}?date=${dayKey}`);
          break;
        case "notes":
          setNotesWeId(we.id);
          break;
        default:
          break; // read-only timeline — no mutations here
      }
    };

  const notesWe = notesWeId ? exercises.find((we) => we.id === notesWeId) : null;
  const comment = summary.comment?.trim() || null;
  const summaryParts = useMemo(() => summaryText(summary), [summary]);

  return (
    <section className="flex flex-col gap-2" aria-label={`Workout ${formatDayLabel(dayKey)}`}>
      {/* DateGroup header — 32px, not a data-row */}
      <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span className="flex-none truncate">{formatDayLabel(dayKey)}</span>
        {comment ? (
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium normal-case tracking-normal text-muted-foreground/70">
            {comment}
          </span>
        ) : (
          <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
        )}
      </h2>

      {/* workout summary row — 48px data-row */}
      <div
        data-row
        {...tourAttrs({ id: "history.summaryRow", label: "Day summary", help: "Volume, set count and duration of that workout.", order: 30, hint: true })}
        className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-sm"
      >
        {summaryParts.map((part, i) => (
          <Fragment key={part}>
            {i > 0 ? (
              <span className="flex-none text-muted-foreground/60" aria-hidden>
                ·
              </span>
            ) : null}
            <span
              className={
                i === 0
                  ? "flex-none font-semibold text-primary"
                  : "flex-none text-muted-foreground"
              }
            >
              {part}
            </span>
          </Fragment>
        ))}
      </div>

      {/* exercise cards — read mode, tap to expand rows */}
      {isLoading && !data ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading workout">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : exercises.length > 0 ? (
        exercises.map((we) => {
          const expanded = expandedId === we.id;
          return (
            <div key={we.id} className="flex flex-col">
              <div
                role="button"
                tabIndex={0}
                aria-label={`${expanded ? "Collapse" : "Expand"} sets of ${we.exercise.name}`}
                {...tourAttrs({ id: "history.workout", label: "Workout block", help: "Tap to expand this workout's exercises and sets.", order: 20 })}
                className="flex-none cursor-pointer"
                onClick={(e) => {
                  // taps on the card's own controls never toggle
                  if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
                  setExpandedId(expanded ? null : we.id);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedId(expanded ? null : we.id);
                  }
                }}
              >
                <ExerciseCard
                  mode="read"
                  collapsed={!expanded}
                  exercise={toCardExercise(we, settings)}
                  sets={toReadCardSets(we.sets)}
                  visibleColumns={visibleColumns}
                  onAction={handleCardAction(we)}
                />
              </div>
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
          );
        })
      ) : (
        <p className="px-1 text-sm text-muted-foreground">Empty workout — no exercises logged.</p>
      )}
    </section>
  );
}
