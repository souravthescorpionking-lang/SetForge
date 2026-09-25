"use client";

// One predefined set row of a routine exercise: numeric fields rendered by the
// exercise type (shared Stepper for weight/reps/distance, hh:mm:ss input for
// time) + Part 2 template chips (set type / RPE / tempo / planned rest) + a
// "blank" action. Every field is OPTIONAL per row: null means "inherit" — when
// ALL numeric fields of ALL sets of the exercise are blank the day logs as a
// copy of the previous workout's sets (server rule); otherwise null Part 2
// fields log as unset (type falls back to Normal).
// The RPE / tempo / rest chips reuse the training set-table cells verbatim
// (src/components/set-table/cells.tsx) so the interaction patterns match.
import { useEffect, useRef, useState } from "react";
import { Copy, Minus, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Stepper } from "@/components/shared/stepper";
import { RpeCell, RestCell, TempoCell } from "@/components/set-table/cells";
import { routinesApi, type PredefinedSetInput } from "@/lib/client/api";
import { formatDuration } from "@/lib/formulas";
import type { PredefinedSetDTO } from "@/lib/types";
import { SET_TYPES, SET_TYPE_META, type SetField, type SetType } from "@/lib/constants";
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

// ---------- Template set-type tag ----------

const CYCLE: SetType[] = ["NORMAL", "WARMUP", "DROP", "FAILURE", "AMRAP"];

/**
 * Template variant of the training SetTypeTag: the value may be null ("not
 * set" — the set logs as Normal, or is copied from the previous workout when
 * the whole exercise is blank). Tap cycles when set and opens the picker when
 * null; long-press / context-menu always opens the picker, which offers a
 * "Not set" option to return to inherit semantics.
 */
function TemplateTypeTag({
  value,
  onChange,
  disabled,
}: {
  value: SetType | null;
  onChange: (t: SetType | null) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const meta = value ? SET_TYPE_META[value] : null;

  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  const startHold = () => {
    longPressed.current = false;
    holdRef.current = setTimeout(() => {
      longPressed.current = true;
      setPickerOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(12); } catch { /* ignore */ }
      }
    }, 420);
  };
  const endHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
  };

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            meta
              ? `Set type: ${meta.label}. Tap to cycle, hold for picker`
              : "Set type not set. Tap to choose"
          }
          title={
            meta
              ? `${meta.label} — ${meta.description}`
              : "Set type — not set (logs as Normal). Tap to choose."
          }
          disabled={disabled}
          onClick={() => {
            if (longPressed.current) { longPressed.current = false; return; }
            if (value == null) {
              setPickerOpen(true);
              return;
            }
            onChange(CYCLE[(CYCLE.indexOf(value) + 1) % CYCLE.length]);
          }}
          onTouchStart={startHold}
          onTouchEnd={endHold}
          onContextMenu={(e) => { e.preventDefault(); setPickerOpen(true); }}
          className={cn(
            "flex h-7 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-transform active:scale-95",
            meta ? cn("w-7", meta.className) : "min-w-7 border border-dashed border-border bg-muted/30 px-1.5 text-muted-foreground/60",
            disabled && "opacity-50",
          )}
        >
          {meta ? (
            meta.letter
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide">type</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Set type</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { onChange(null); setPickerOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
              value == null && "bg-accent",
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[11px] font-bold text-muted-foreground/60">
              –
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">Not set</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">
                Logs as Normal, or copies previous
              </span>
            </span>
          </button>
          {SET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); setPickerOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                t === value && "bg-accent",
              )}
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold", SET_TYPE_META[t].className)}>
                {SET_TYPE_META[t].letter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{SET_TYPE_META[t].label}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">{SET_TYPE_META[t].description}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  // Server guarantees the enum; anything else is treated as "not set".
  const setType = (set.setType ?? null) as SetType | null;

  // Fully blank row (every numeric field AND every Part 2 field null) — a row
  // that contributes nothing. NOTE: the server's copy-previous rule only looks
  // at the numeric fields (see routine-service logDay); the exercise-level
  // "copy previous" badge in routine-exercise-row mirrors that.
  const isBlankRow =
    fields.every((f) => set[f] == null) &&
    setType == null &&
    set.rpe == null &&
    set.tempo == null &&
    set.restPlannedSec == null;

  const update = (patch: PredefinedSetInput) => {
    void run(() => routinesApi.updateSet(routineId, dayId, routineExerciseId, set.id, patch), {
      path: setPath,
      method: "PATCH",
      body: patch,
      label: "Set change",
    });
  };

  const blankRow = () => {
    const patch: PredefinedSetInput = {
      weight: null,
      reps: null,
      distance: null,
      timeSec: null,
      setType: null,
      rpe: null,
      tempo: null,
      restPlannedSec: null,
    };
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

        {/* Part 2 template chips — same cells/interactions as the training set
            table. Kept as one shrink-0 group so on narrow screens they collapse
            to a single chip row under the numeric fields. Blank = inherit. */}
        <div className="flex shrink-0 items-center gap-1">
          <TemplateTypeTag value={setType} onChange={(t) => update({ setType: t })} />
          <RpeCell value={set.rpe ?? null} onChange={(rpe) => update({ rpe })} placeholder="rpe" />
          <TempoCell value={set.tempo ?? null} onChange={(tempo) => update({ tempo })} placeholder="tempo" />
          <RestCell
            plannedSec={set.restPlannedSec ?? null}
            remainingSec={null}
            onChange={(restPlannedSec) => update({ restPlannedSec })}
            placeholder="rest"
          />
        </div>

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
