"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — muscle dots + chips (§4.1/§4.3/§4.5/§4.6). 8px dots (≤3) and 40px
// chip rows. Colours from the deterministic 8-hue palette by enum index.
// ─────────────────────────────────────────────────────────────────────────────
import { MUSCLE_LABELS, muscleColour, type Muscle } from "@/lib/constants";

export function MuscleDots({ muscles, max = 3, show = true }: { muscles?: string[] | null; max?: number; show?: boolean }) {
  if (!show || !muscles || muscles.length === 0) return null;
  const shown = muscles.slice(0, max);
  return (
    <span className="flex flex-none items-center gap-1" aria-hidden>
      {shown.map((m) => (
        <span key={m} className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: muscleColour(m) }} title={MUSCLE_LABELS[m as Muscle] ?? m} />
      ))}
    </span>
  );
}

export function MuscleChipRow({ muscles, secondary, show = true, label }: { muscles?: string[] | null; secondary?: string[] | null; show?: boolean; label?: string }) {
  if (!show || !muscles || muscles.length === 0) return null;
  const all = [...muscles, ...(secondary ?? [])];
  return (
    <div className="flex h-10 flex-none items-center gap-2 overflow-x-auto" data-chip-scroller>
      {label != null && <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>}
      {all.map((m) => (
        <span
          key={m}
          className="flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold"
          title={secondary?.includes(m) ? `${MUSCLE_LABELS[m as Muscle] ?? m} (secondary)` : MUSCLE_LABELS[m as Muscle] ?? m}
        >
          <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: muscleColour(m) }} aria-hidden />
          {MUSCLE_LABELS[m as Muscle] ?? m}
        </span>
      ))}
    </div>
  );
}

export function EquipmentChipRow({ equipment, show = true, label = "Equipment" }: { equipment?: string[] | null; show?: boolean; label?: string }) {
  if (!show || !equipment || equipment.length === 0) return null;
  return (
    <div className="flex h-10 flex-none items-center gap-2 overflow-x-auto" data-chip-scroller>
      <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {equipment.map((e) => (
        <span key={e} className="flex h-8 flex-none items-center rounded-full border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground">
          {e.replace(/_/g, " ").toLowerCase()}
        </span>
      ))}
    </div>
  );
}
