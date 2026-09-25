"use client";

// Calendar filter panel (applies to the List view).
// - Category multi-select with Match All / Match Any
// - Exercise condition filter: weight/reps/distance/time ≥ thresholds.
//   Set-level matching is computed from the exercise's history endpoint.

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { CategoryDot } from "@/components/shared/category-dot";
import { useCategories } from "@/lib/client/query";
import { cn } from "@/lib/utils";
import { countActiveFilters, type CalendarFilters } from "./filter-state";
import { Dumbbell, Filter, RotateCcw, X } from "lucide-react";

type Props = {
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
};

export function FiltersBar({ filters, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { data: categories = [] } = useCategories();
  const activeCount = countActiveFilters(filters);

  const patch = (p: Partial<CalendarFilters>) => onChange({ ...filters, ...p });

  const toggleCategory = (name: string) => {
    const has = filters.categoryNames.includes(name);
    patch({
      categoryNames: has
        ? filters.categoryNames.filter((n) => n !== name)
        : [...filters.categoryNames, name],
    });
  };

  const clear = () =>
    onChange({
      ...filters,
      categoryNames: [],
      exerciseId: null,
      exerciseName: null,
      weightMin: null,
      repsMin: null,
      distanceMin: null,
      timeMinSec: null,
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant={activeCount > 0 ? "default" : "outline"} size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="numeric ml-0.5 h-5 min-w-5 px-1 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 rounded-xl p-3 sm:w-96">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Categories
                </Label>
                <div className="flex items-center gap-1">
                  {(["any", "all"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => patch({ categoryMatch: mode })}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        filters.categoryMatch === mode
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      Match {mode === "any" ? "Any" : "All"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const selected = filters.categoryNames.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(c.name)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <CategoryDot colour={c.colour} size={8} ring={false} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Exercise conditions
              </Label>
              {filters.exerciseId ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="max-w-[200px] gap-1 truncate">
                    <Dumbbell className="h-3 w-3 shrink-0" />
                    <span className="truncate">{filters.exerciseName ?? "Exercise"}</span>
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remove exercise filter"
                    onClick={() => patch({ exerciseId: null, exerciseName: null })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1.5 w-full gap-1.5"
                  onClick={() => setPickerOpen(true)}
                >
                  <Dumbbell className="h-4 w-4" />
                  Pick exercise…
                </Button>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <ConditionInput
                  label="Weight ≥"
                  unit="kg"
                  value={filters.weightMin}
                  onChange={(v) => patch({ weightMin: v })}
                />
                <ConditionInput
                  label="Reps ≥"
                  unit="reps"
                  value={filters.repsMin}
                  onChange={(v) => patch({ repsMin: v })}
                />
                <ConditionInput
                  label="Distance ≥"
                  unit="km"
                  value={filters.distanceMin}
                  onChange={(v) => patch({ distanceMin: v })}
                />
                <ConditionInput
                  label="Time ≥"
                  unit="min"
                  value={filters.timeMinSec == null ? null : filters.timeMinSec / 60}
                  onChange={(v) => patch({ timeMinSec: v == null ? null : Math.round(v * 60) })}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                A workout matches if any set of that exercise meets all filled thresholds.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={clear}
                disabled={activeCount === 0}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear filters
              </Button>
              <Button size="sm" onClick={() => setPopoverOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Filter by exercise"
        description="Only workouts containing this exercise (meeting the thresholds) will be shown."
        onPick={(e) => patch({ exerciseId: e.id, exerciseName: e.name })}
      />
    </div>
  );
}

function ConditionInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`cond-${label}`} className="text-[11px] text-muted-foreground">
        {label} <span className="opacity-60">({unit})</span>
      </Label>
      <Input
        id={`cond-${label}`}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        placeholder="—"
        className="h-8 text-sm numeric"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isNaN(n) ? null : n);
        }}
      />
    </div>
  );
}
