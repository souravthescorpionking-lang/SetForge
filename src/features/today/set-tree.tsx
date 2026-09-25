"use client";

// Checkbox tree of workout exercises → sets. Used by the Copy Workout dialog
// to pick exactly which sets get copied in.
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { WorkoutExerciseDTO } from "@/lib/types";
import { setSummary } from "@/lib/client/format";
import { cn } from "@/lib/utils";

export function SetTree({
  exercises,
  selected,
  onChange,
}: {
  exercises: WorkoutExerciseDTO[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSet = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleExercise = (we: WorkoutExerciseDTO) => {
    const ids = we.sets.map((s) => s.id);
    const all = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    onChange(next);
  };

  if (exercises.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No exercises logged that day.</p>;
  }

  return (
    <div className="space-y-1.5">
      {exercises.map((we) => {
        const ids = we.sets.map((s) => s.id);
        const all = ids.length > 0 && ids.every((id) => selected.has(id));
        const some = ids.some((id) => selected.has(id));
        const isCollapsed = collapsed.has(we.id);
        return (
          <div key={we.id} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <Checkbox
                aria-label={`Select all sets of ${we.exercise.name}`}
                checked={all ? true : some ? "indeterminate" : false}
                onCheckedChange={() => toggleExercise(we)}
                className="h-5 w-5"
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  const next = new Set(collapsed);
                  if (next.has(we.id)) next.delete(we.id);
                  else next.add(we.id);
                  setCollapsed(next);
                }}
                aria-expanded={!isCollapsed}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{we.exercise.name}</span>
                <span className="numeric shrink-0 text-[11px] text-muted-foreground">
                  {ids.filter((id) => selected.has(id)).length}/{ids.length}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
              </button>
            </div>
            {!isCollapsed && (
              <ul className="divide-y divide-border/60 border-t">
                {we.sets.map((s, i) => (
                  <li key={s.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-accent/60">
                      <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSet(s.id)} className="h-4.5 w-4.5" />
                      <span className="numeric w-5 shrink-0 text-[11px] text-muted-foreground">{i + 1}</span>
                      <span className="numeric text-sm font-medium">{setSummary(s)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
