"use client";

// ─────────────────────────────────────────────────────────────────────────────
// header-block.tsx — Part 6 §4.5/§4.6 header blocks.
//
//   ProgramHeaderBlock  120px card (§4.5 program detail): ProgressRing 72
//                       “4/12” + 3 single-line 32px rows (difficulty pill +
//                       cadence · highlights 1/2). Tap → 0fr→1fr inline
//                       expansion (max 4 highlight lines + equipment chips).
//   DayHeaderBlock       96px card (§4.6 day detail): DurationRing 56 + two
//                       32px lines (muscle chips · counts).
//   TotalsRow            56px card, 3 equal cells with dividers
//                       (sets logged · weight lifted · workouts).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressRing, DurationRing } from "@/components/shared/progress-ring";
import { EquipmentChipRow, MuscleChipRow } from "@/components/shared/muscle-dots";
import { compactNumber, DifficultyPill } from "./program-meta";
import type { ProgramTotalsDTO } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramHeaderBlock
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgramHeaderBlockProps {
  /** Completed workout days (completedDayIds ∪ DONE schedule entries). */
  completed: number;
  /** Total WORKOUT days in the routine. */
  total: number;
  difficulty?: string | null;
  daysPerWeek?: number | null;
  estMinutes?: number | null;
  highlights?: string[] | null;
  /** Union of equipment across the routine's day exercises. */
  equipment?: string[] | null;
  showEquipmentChips?: boolean;
}

export function ProgramHeaderBlock({
  completed,
  total,
  difficulty,
  daysPerWeek,
  estMinutes,
  highlights,
  equipment,
  showEquipmentChips = true,
}: ProgramHeaderBlockProps) {
  const [open, setOpen] = useState(false);
  const lines = (highlights ?? []).filter((h) => h && h.trim().length > 0);
  const equipmentList = equipment ?? [];
  const expandable = lines.length > 2 || equipmentList.length > 0;
  const fraction = total > 0 ? Math.min(1, completed / total) : 0;

  // line 1 right text: `4 days/wk · ~55 min` (nulls omitted)
  const cadence: string[] = [];
  if (daysPerWeek != null && daysPerWeek > 0) {
    cadence.push(`${daysPerWeek} ${daysPerWeek === 1 ? "day/wk" : "days/wk"}`);
  }
  if (estMinutes != null && estMinutes > 0) cadence.push(`~${estMinutes} min`);

  return (
    <section className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card" aria-label="Program overview">
      <button
        type="button"
        className="flex h-[120px] w-full flex-none items-center gap-3 px-3 text-left"
        aria-expanded={open}
        aria-label={expandable ? "Program overview — tap for details" : "Program overview"}
        onClick={() => expandable && setOpen((o) => !o)}
      >
        <ProgressRing
          fraction={fraction}
          size={72}
          stroke={6}
          label={`${completed}/${total}`}
          className="flex-none"
        />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <span className="flex h-8 min-w-0 flex-none items-center gap-2">
            <DifficultyPill difficulty={difficulty} />
            {cadence.length > 0 ? (
              <span className="truncate text-xs leading-none text-muted-foreground">{cadence.join(" · ")}</span>
            ) : null}
          </span>
          {lines.length > 0 ? (
            <span className="flex h-8 min-w-0 flex-none items-center overflow-hidden">
              <span className="truncate text-[13px] leading-none text-foreground/90">{lines[0]}</span>
            </span>
          ) : (
            <span className="flex h-8 min-w-0 flex-none items-center text-[13px] leading-none text-muted-foreground">
              —
            </span>
          )}
          <span className="flex h-8 min-w-0 flex-none items-center overflow-hidden">
            <span className="truncate text-[13px] leading-none text-foreground/90">{lines[1] ?? ""}</span>
          </span>
        </span>
        {expandable ? (
          <ChevronDown
            className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", open ? "" : "-rotate-90")}
            aria-hidden
          />
        ) : null}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? (
            <div className="flex flex-col gap-1 px-3 pb-3">
              {lines.slice(0, 4).map((h, i) => (
                <p key={i} className="flex-none text-[13px] leading-relaxed text-foreground/90">
                  {h}
                </p>
              ))}
              {lines.length === 0 ? (
                <p className="flex-none text-[13px] text-muted-foreground">No highlights yet.</p>
              ) : null}
              <EquipmentChipRow equipment={equipmentList} show={showEquipmentChips} label="Equipment" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DayHeaderBlock
// ─────────────────────────────────────────────────────────────────────────────

export interface DayHeaderBlockProps {
  minutes?: number | null;
  primaryMuscles?: string[] | null;
  exerciseCount: number;
  setCount: number;
  showMuscleChips?: boolean;
}

export function DayHeaderBlock({
  minutes,
  primaryMuscles,
  exerciseCount,
  setCount,
  showMuscleChips = true,
}: DayHeaderBlockProps) {
  return (
    <section
      className="flex h-24 w-full flex-none items-center gap-3 overflow-hidden rounded-lg border bg-card px-3"
      aria-label="Day overview"
    >
      <DurationRing minutes={minutes ?? null} size={56} stroke={6} className="flex-none" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <MuscleChipRow muscles={primaryMuscles} show={showMuscleChips} />
        <p className="flex h-6 min-w-0 flex-none items-center overflow-hidden text-xs leading-none text-muted-foreground">
          <span className="truncate">
            {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"} · {setCount}{" "}
            {setCount === 1 ? "set" : "sets"}
          </span>
        </p>
      </span>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TotalsRow
// ─────────────────────────────────────────────────────────────────────────────

function TotalsCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
      <span className="truncate text-sm font-bold leading-none tabular-nums">{value}</span>
      <span className="truncate text-[11px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

export function TotalsRow({ totals }: { totals: ProgramTotalsDTO | undefined }) {
  return (
    <div
      data-row
      aria-label="Program totals"
      className="flex h-14 w-full flex-none items-stretch overflow-hidden whitespace-nowrap rounded-lg border bg-card"
    >
      <TotalsCell label="Sets logged" value={totals ? compactNumber(totals.setsLogged) : "–"} />
      <span className="w-px flex-none bg-border" aria-hidden />
      <TotalsCell
        label="Weight lifted"
        value={totals ? `${compactNumber(Math.round(totals.weightLifted))} kg` : "–"}
      />
      <span className="w-px flex-none bg-border" aria-hidden />
      <TotalsCell label="Workouts" value={totals ? compactNumber(totals.workouts) : "–"} />
    </div>
  );
}
