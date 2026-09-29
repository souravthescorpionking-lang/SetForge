"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FiltersScreen — the full-screen calendar filters route (#/calendar/filters,
// p3-6). Replaces the legacy FiltersBar popover with a real Screen:
//
//   TopBar (56)  : back (→ #/calendar) · "Filters" · Reset action
//   ScrollBody   : grouped filter rows —
//     Categories : Match Any/All radio rows (48px data-rows) + category
//                  checkbox rows (56px data-rows, colour dot + name)
//     Exercise   : current-exercise row (56px) expanding INLINE (no dialogs)
//                  into a search row + exercise picker rows (48px data-rows)
//     Conditions : Weight / Reps / Distance / Time ≥ threshold rows (56px
//                  data-rows with trailing numeric inputs; disabled until an
//                  exercise is picked)
//
// Every change applies immediately to the shared filter store (filter-store.ts
// over the legacy sessionStorage persistence) — Back then returns to
// #/calendar with the ChipRow SubBar listing the applied filters.
// Filtering logic (matching, counts) is the legacy filter-state module.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs, type TourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Dumbbell,
  RotateCcw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { useCategories, useExercises } from "@/lib/client/query";
import type { ExerciseDTO } from "@/lib/types";
import {
  patchCalendarFilters,
  resetCalendarFilters,
  useCalendarFilters,
} from "./filter-store";
import { countActiveFilters } from "./filter-state";

/** 32px section header — deliberately NOT a data-row (height law). */
function SectionHeader({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <h2
      className={cn(
        "flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider",
        muted ? "text-muted-foreground/60" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
    </h2>
  );
}

function RadioMark({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 flex-none items-center justify-center rounded-full border-2",
        active ? "border-primary" : "border-muted-foreground/40",
      )}
      aria-hidden
    >
      {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border-2",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
      )}
      aria-hidden
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

export default function FiltersScreen() {
  const navigate = useApp((s) => s.navigate);
  const filters = useCalendarFilters();
  const { data: categories = [] } = useCategories();

  // inline exercise picker (expansion state only — values live in the store)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const exercisesQuery = useExercises(debouncedSearch ? { search: debouncedSearch } : undefined);
  // enabled only while the picker section is expanded
  const exercises = useMemo(
    () => (pickerOpen ? exercisesQuery.data ?? [] : []),
    [pickerOpen, exercisesQuery.data],
  );

  const activeCount = countActiveFilters(filters);
  const conditionsDisabled = !filters.exerciseId;

  const toggleCategory = (name: string) => {
    const has = filters.categoryNames.includes(name);
    patchCalendarFilters({
      categoryNames: has
        ? filters.categoryNames.filter((n) => n !== name)
        : [...filters.categoryNames, name],
    });
  };

  const pickExercise = (exercise: ExerciseDTO | null) => {
    patchCalendarFilters({
      exerciseId: exercise?.id ?? null,
      exerciseName: exercise?.name ?? null,
    });
    setPickerOpen(false);
    setSearch("");
  };

  const numberValue = (v: number | null) => (v == null ? "" : String(v));
  const numberPatch = (raw: string): number | null => {
    const cleaned = raw.trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              tour={{ id: "calendarFilters.back", label: "Back", help: "Return to the calendar with filters applied.", order: 10 }}
              onClick={() => navigate("/calendar")}
              aria-label="Back to calendar"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title="Filters"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-11 flex-none gap-1.5 px-3 text-sm font-semibold"
                tour={{ id: "calendarFilters.reset", label: "Reset", help: "Clear every filter back to all workouts.", order: 20 }}
                onClick={() => resetCalendarFilters()}
                disabled={activeCount === 0}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reset
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {/* ── Categories ─────────────────────────────────────────────── */}
        <SectionHeader label="Categories" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            <button
              type="button"
              data-row
              role="radio"
              aria-checked={filters.categoryMatch === "any"}
              {...tourAttrs({ id: "calendarFilters.matchAny", label: "Match any", help: "Show workouts touching any picked category.", order: 30 })}
              onClick={() => patchCalendarFilters({ categoryMatch: "any" })}
              className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <RadioMark active={filters.categoryMatch === "any"} />
              <span className="min-w-0 flex-1 truncate">Match any category</span>
              <span className="w-24 flex-none truncate text-right text-xs text-muted-foreground">
                broader
              </span>
            </button>
            <button
              type="button"
              data-row
              role="radio"
              aria-checked={filters.categoryMatch === "all"}
              {...tourAttrs({ id: "calendarFilters.matchAll", label: "Match all", help: "Only workouts containing every picked category.", order: 40 })}
              onClick={() => patchCalendarFilters({ categoryMatch: "all" })}
              className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <RadioMark active={filters.categoryMatch === "all"} />
              <span className="min-w-0 flex-1 truncate">Match all categories</span>
              <span className="w-24 flex-none truncate text-right text-xs text-muted-foreground">
                stricter
              </span>
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {categories.map((c) => {
              const selected = filters.categoryNames.includes(c.name);
              return (
                <button
                  key={c.id}
                  type="button"
                  data-row
                  role="checkbox"
                  aria-checked={selected}
                  {...tourAttrs({ id: "calendarFilters.category", label: "Category row", help: "Toggle a category filter on or off.", order: 50 })}
                  onClick={() => toggleCategory(c.name)}
                  className="flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  <CheckboxMark checked={selected} />
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: c.colour }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  {typeof c.exerciseCount === "number" ? (
                    <span className="w-24 flex-none truncate text-right text-xs tabular-nums text-muted-foreground">
                      {c.exerciseCount} ex
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Exercise ────────────────────────────────────────────────── */}
        <SectionHeader label="Exercise" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            <button
              type="button"
              data-row
              aria-expanded={pickerOpen}
              {...tourAttrs({ id: "calendarFilters.exercise", label: "Exercise filter", help: "Pick one exercise to filter workouts by.", order: 60 })}
              onClick={() => setPickerOpen((v) => !v)}
              className="flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <Dumbbell className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  filters.exerciseId ? "font-medium" : "text-muted-foreground",
                )}
              >
                {filters.exerciseName ?? "Any exercise"}
              </span>
              <ChevronDown
                className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", pickerOpen && "rotate-180")}
                aria-hidden
              />
            </button>

            {pickerOpen ? (
              <>
                <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap px-3">
                  <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search exercises…"
                    aria-label="Search exercises to filter by"
                    {...tourAttrs({ id: "calendarFilters.search", label: "Search", help: "Find the exercise to filter on.", order: 70 })}
                    className="h-9 flex-1"
                  />
                </div>
                {exercisesQuery.isLoading && exercises.length === 0 ? (
                  <div className="flex flex-col gap-2 p-3" aria-busy="true" aria-label="Loading exercises">
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-10 rounded-lg" />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      data-row
                      {...tourAttrs({ id: "calendarFilters.anyExercise", label: "Any exercise", help: "Clear the exercise filter.", order: 80 })}
                      onClick={() => pickExercise(null)}
                      className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50"
                    >
                      <span className="min-w-0 flex-1 truncate">Any exercise</span>
                      {filters.exerciseId ? null : <Check className="h-4 w-4 flex-none text-primary" aria-hidden />}
                    </button>
                    {exercises.map((ex) => {
                      const selected = ex.id === filters.exerciseId;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          data-row
                          {...tourAttrs({ skipTour: true, reason: "Data-driven exercise picker rows below the search field" })}
                          onClick={() => pickExercise(ex)}
                          className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
                        >
                          <span
                            className="h-2.5 w-2.5 flex-none rounded-full"
                            style={{ backgroundColor: ex.category?.colour ?? "#71717a" }}
                            aria-hidden
                          />
                          <span className={cn("min-w-0 flex-1 truncate", selected && "font-medium")}>
                            {ex.name}
                          </span>
                          {selected ? <Check className="h-4 w-4 flex-none text-primary" aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* ── Conditions ─────────────────────────────────────────────── */}
        <SectionHeader label="Conditions" muted={conditionsDisabled} />
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-card transition-opacity",
            conditionsDisabled && "opacity-50",
          )}
          aria-disabled={conditionsDisabled}
        >
          <div className="divide-y divide-border/60">
            <ConditionRow
              label="Weight ≥"
              unit="kg"
              value={numberValue(filters.weightMin)}
              disabled={conditionsDisabled}
              tour={{ id: "calendarFilters.weight", label: "Weight ≥", help: "Show workouts with a set at or above this weight.", order: 90 }}
              onChange={(raw) => patchCalendarFilters({ weightMin: numberPatch(raw) })}
            />
            <ConditionRow
              label="Reps ≥"
              unit="reps"
              value={numberValue(filters.repsMin)}
              disabled={conditionsDisabled}
              tour={{ id: "calendarFilters.reps", label: "Reps ≥", help: "Show workouts with a set at or above this rep count.", order: 100 }}
              onChange={(raw) => patchCalendarFilters({ repsMin: numberPatch(raw) })}
            />
            <ConditionRow
              label="Distance ≥"
              unit="km"
              value={numberValue(filters.distanceMin)}
              disabled={conditionsDisabled}
              tour={{ id: "calendarFilters.distance", label: "Distance ≥", help: "Show workouts with a set at or above this distance.", order: 110 }}
              onChange={(raw) => patchCalendarFilters({ distanceMin: numberPatch(raw) })}
            />
            <ConditionRow
              label="Time ≥"
              unit="min"
              value={filters.timeMinSec == null ? "" : String(filters.timeMinSec / 60)}
              disabled={conditionsDisabled}
              tour={{ id: "calendarFilters.time", label: "Time ≥", help: "Show workouts with a set at or above this duration.", order: 120 }}
              onChange={(raw) => {
                const v = numberPatch(raw);
                patchCalendarFilters({ timeMinSec: v == null ? null : Math.round(v * 60) });
              }}
            />
          </div>
        </div>
        <p className="px-1 text-xs leading-snug text-muted-foreground">
          A workout matches when any set of the picked exercise meets every
          filled threshold. Conditions apply to the List view.
        </p>
      </ScrollBody>
    </Screen>
  );
}

function ConditionRow({
  label,
  unit,
  value,
  disabled,
  onChange,
  tour,
}: {
  label: string;
  unit: string;
  value: string;
  disabled: boolean;
  onChange: (raw: string) => void;
  /** Inline tour declaration — renders data-tour-id on the input (Part 7). */
  tour?: TourDecl;
}) {
  const tourSpread: TourAttrs = tour ? tourAttrs(tour) : ({} as TourAttrs);
  return (
    <div data-row className="flex h-14 items-center gap-3 overflow-hidden whitespace-nowrap px-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">({unit})</span>
      </span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        disabled={disabled}
        placeholder="—"
        aria-label={`${label} ${unit}`}
        {...tourSpread}
        className="h-9 w-28 flex-none text-right tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
