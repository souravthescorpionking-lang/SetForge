"use client";

// One predefined set row of a routine exercise: numeric fields rendered by the
// exercise type (shared Stepper for weight/reps/distance, hh:mm:ss input for
// time) + a "blank" action. A row with every field null logs as a copy of the
// previous workout's sets when ALL sets of the exercise are blank (server rule).
import { useState } from "react";
import { Copy, Minus, Plus, X } from "lucide-react";
import { Stepper } from "@/components/shared/stepper";
import { routinesApi, type PredefinedSetInput } from "@/lib/client/api";
import { formatDuration } from "@/lib/formulas";
import type { PredefinedSetDTO } from "@/lib/types";
import type { SetField } from "@/lib/constants";
import { useRoutineMutations } from "./use-routine-mutations";
import { cn } from "@/lib/utils";

type Props = {
  routineId: string;
  dayId: string;
  routineExerciseId: string;
  set: PredefinedSetDTO;
  index: number;
  fields: SetField[];
  weightStep: number;
};

/** hh:mm:ss (or m:ss / plain seconds) input with hold-free ± buttons stepping 15s. */
function TimeField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value == null ? "" : formatDuration(value));

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parts = trimmed.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) {
      setDraft(null);
      return;
    }
    let sec: number;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else sec = parts[0];
    onChange(Math.max(0, Math.round(sec)));
    setDraft(null);
  };

  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, (value ?? 0) + dir * 15);
    onChange(next);
    setDraft(null);
  };

  const btn =
    "flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent";

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
      <button type="button" aria-label="decrease time" className={btn} onClick={() => bump(-1)}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label="Time (h:mm:ss)"
        inputMode="numeric"
        placeholder="–:––"
        className="numeric w-full min-w-0 bg-transparent py-1.5 text-center text-sm font-semibold outline-none"
        value={display}
        onFocus={(e) => {
          setDraft(value == null ? "" : formatDuration(value));
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9:]/g, ""))}
        onBlur={() => commit(draft ?? "")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(draft ?? "");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button type="button" aria-label="increase time" className={btn} onClick={() => bump(1)}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PredefinedSetRow({ routineId, dayId, routineExerciseId, set, index, fields, weightStep }: Props) {
  const { run } = useRoutineMutations();

  const setPath = `/api/routines/${routineId}/days/${dayId}/exercises/${routineExerciseId}/sets/${set.id}`;

  const isBlankRow = fields.every((f) => set[f] == null);

  const update = (patch: PredefinedSetInput) => {
    void run(() => routinesApi.updateSet(routineId, dayId, routineExerciseId, set.id, patch), {
      path: setPath,
      method: "PATCH",
      body: patch,
      label: "Set change",
    });
  };

  const blankRow = () => {
    const patch = { weight: null, reps: null, distance: null, timeSec: null };
    void run(() => routinesApi.updateSet(routineId, dayId, routineExerciseId, set.id, patch), {
      path: setPath,
      method: "PATCH",
      body: patch,
      label: "Blank set (copy previous)",
    });
  };

  const remove = () => {
    void run(() => routinesApi.removeSet(routineId, dayId, routineExerciseId, set.id), {
      path: setPath,
      method: "DELETE",
      label: "Remove set",
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-2 py-1.5">
      <span className="numeric w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {fields.map((f) => (
          <div key={f} className="min-w-[112px] flex-1 basis-[calc(50%-6px)] sm:max-w-[190px]">
            {f === "weight" && (
              <Stepper
                size="sm"
                value={set.weight}
                onChange={(v) => update({ weight: v })}
                step={weightStep}
                decimals={1}
                allowClear
                suffix="kg"
                ariaLabel="weight"
              />
            )}
            {f === "reps" && (
              <Stepper
                size="sm"
                value={set.reps}
                onChange={(v) => update({ reps: v })}
                step={1}
                decimals={0}
                allowClear
                suffix="reps"
                ariaLabel="reps"
              />
            )}
            {f === "distance" && (
              <Stepper
                size="sm"
                value={set.distance}
                onChange={(v) => update({ distance: v })}
                step={0.25}
                decimals={2}
                allowClear
                suffix="km"
                ariaLabel="distance"
              />
            )}
            {f === "timeSec" && <TimeField value={set.timeSec} onChange={(v) => update({ timeSec: v })} />}
          </div>
        ))}
        {isBlankRow && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Copy className="h-3 w-3" aria-hidden /> blank
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={blankRow}
          disabled={isBlankRow}
          title="Blank this set — leaves it to copy your previous workout"
          aria-label="Blank set to copy previous"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            isBlankRow && "cursor-not-allowed opacity-40",
          )}
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove set ${index + 1}`}
          title="Remove set"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
