"use client";

// ─────────────────────────────────────────────────────────────────────────────
// add-flow-shared — tiny presentational atoms shared by the §4.3/§4.4 add-flow
// screens (checkbox mark, muscle chips, section label). Kept local to the
// builder feature; the on-demand filters screen keeps its own (different
// styling context) — no cross-feature dependency.
// ─────────────────────────────────────────────────────────────────────────────

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, type Muscle } from "@/lib/constants";

/** 16px checkbox glyph (role=checkbox lives on the row button). */
export function CheckboxMark({ checked }: { checked: boolean }) {
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

/** 16px radio glyph (role=radio lives on the row button). */
export function RadioMark({ active }: { active: boolean }) {
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

/** Muscle label of a stored enum value ("CHEST" → "Chest"). */
export function muscleLabelOf(value: string): string {
  return MUSCLE_LABELS[value as Muscle] ?? value.replace(/_/g, " ").toLowerCase();
}

/** Up to `max` tiny muscle chips for an exercise row (§4.3 list rows). */
export function MuscleChips({ muscles, max = 2 }: { muscles: string[]; max?: number }) {
  const shown = muscles.filter(Boolean).slice(0, max);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-none items-center gap-1 overflow-hidden" aria-hidden>
      {shown.map((m) => (
        <span
          key={m}
          className="flex h-6 max-w-20 items-center overflow-hidden rounded-full border border-border px-2 text-[10px] font-semibold leading-none text-muted-foreground"
        >
          <span className="truncate">{muscleLabelOf(m)}</span>
        </span>
      ))}
    </span>
  );
}

/** 32px section header row (not a data-row — height law). */
export function SectionLabel({ title }: { title: string }) {
  return (
    <p
      role="group"
      aria-label={title}
      className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
    >
      <span className="truncate">{title}</span>
    </p>
  );
}
