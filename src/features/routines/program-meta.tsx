"use client";

// ─────────────────────────────────────────────────────────────────────────────
// program-meta.tsx — Part 6 §4.4/§4.5 shared program-metadata presentation.
//
//   DifficultyPill     36px uppercase chip (BEGINNER emerald · INTERMEDIATE
//                      amber · ADVANCED violet), defensive against null.
//   formatProgramMeta  the RoutineRow/SessionRow second line builder
//                      (`Intermediate · 4 days/wk · 3 phases · ~55 min · used 3d`)
//   useProgramExtras   queryClient invalidation for the program meta/totals/
//                      schedule queries introduced by the Part 6 routines UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { programsMetaApi, scheduleApi } from "@/lib/client/api";
import { addDaysKey, todayKey } from "@/lib/client/format";

/** Query keys owned by this feature (Part 6 program meta/totals/schedule join). */
export const programExtraKeys = {
  meta: (routineId: string) => ["program-meta", routineId] as const,
  totals: (routineId: string) => ["program-totals", routineId] as const,
  schedule: (routineId: string) => ["program-schedule", routineId] as const,
};

const DIFFICULTY_COLOURS: Record<string, string> = {
  BEGINNER: "#10b981",
  INTERMEDIATE: "#f59e0b",
  ADVANCED: "#a855f7",
};

/** 36px difficulty chip — colour-coded, 10px bold uppercase. Null → nothing. */
export function DifficultyPill({ difficulty, className }: { difficulty?: string | null; className?: string }) {
  if (!difficulty) return null;
  const colour = DIFFICULTY_COLOURS[difficulty] ?? "#a1a1aa";
  const label = DIFFICULTY_LABELS[difficulty as Difficulty] ?? difficulty;
  return (
    <span
      className={cn(
        "flex h-7 min-w-[36px] flex-none items-center justify-center rounded-full px-2 text-[10px] font-bold uppercase leading-none tracking-wide",
        className,
      )}
      style={{ backgroundColor: `${colour}1f`, color: colour, border: `1px solid ${colour}55` }}
      title={`Difficulty: ${label}`}
    >
      {label}
    </span>
  );
}

/** Defensive metadata accessor — seeded metadata arrives from agent 6-c0. */
export function difficultyLabel(difficulty?: string | null): string | null {
  if (!difficulty) return null;
  return DIFFICULTY_LABELS[difficulty as Difficulty] ?? difficulty;
}

export interface ProgramMetaLineInput {
  difficulty?: string | null;
  daysPerWeek?: number | null;
  phaseCount?: number | null;
  estMinutes?: number | null;
  usedAgo?: string | null;
}

/** `Intermediate · 4 days/wk · 3 phases · ~55 min · used 3d` — null parts omitted. */
export function formatProgramMeta(input: ProgramMetaLineInput): string {
  const parts: string[] = [];
  const dl = difficultyLabel(input.difficulty);
  if (dl) parts.push(dl);
  if (input.daysPerWeek != null && input.daysPerWeek > 0) {
    parts.push(`${input.daysPerWeek} ${input.daysPerWeek === 1 ? "day/wk" : "days/wk"}`);
  }
  if (input.phaseCount != null && input.phaseCount > 0) {
    parts.push(`${input.phaseCount} ${input.phaseCount === 1 ? "phase" : "phases"}`);
  }
  if (input.estMinutes != null && input.estMinutes > 0) parts.push(`~${input.estMinutes} min`);
  if (input.usedAgo) parts.push(input.usedAgo);
  return parts.join(" · ");
}

/** Compact number for totals (545 · 13.2k · 1.32M). */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Invalidate every query the Part 6 program surfaces read from:
 * program-meta / program-totals / program-schedule (all ids — prefix match),
 * plus routine/routines/dashboard/schedule/programs via the shared keys.
 */
export function useProgramExtras() {
  const qc = useQueryClient();
  return useCallback(
    (routineId?: string) => {
      if (routineId) {
        void qc.invalidateQueries({ queryKey: programExtraKeys.meta(routineId) });
        void qc.invalidateQueries({ queryKey: programExtraKeys.totals(routineId) });
        void qc.invalidateQueries({ queryKey: programExtraKeys.schedule(routineId) });
      } else {
        void qc.invalidateQueries({ queryKey: ["program-meta"] });
        void qc.invalidateQueries({ queryKey: ["program-totals"] });
        void qc.invalidateQueries({ queryKey: ["program-schedule"] });
      }
      void qc.invalidateQueries({ queryKey: ["routines"] });
      void qc.invalidateQueries({ queryKey: ["routine"] });
      void qc.invalidateQueries({ queryKey: ["programs"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    [qc],
  );
}

/**
 * Un-mark a day off AND clean up the DONE schedule entry that markOff created
 * (§4.5/§4.8 Undo symmetry): entries with status DONE and no linked workout
 * around today for this day are removed, so the Done chip / ring reflect the
 * undo everywhere. Entries linked to real workouts are never touched.
 * Callers invalidate via useProgramExtras() afterwards.
 */
export async function unmarkDayOffFull(routineId: string, dayId: string): Promise<void> {
  await programsMetaApi.unmarkOff(routineId, dayId);
  try {
    const from = addDaysKey(todayKey(), -1);
    const to = addDaysKey(todayKey(), 1);
    const res = await scheduleApi.list({ from, to });
    for (const e of res.entries) {
      if (e.routineId === routineId && e.dayId === dayId && e.status === "DONE" && !e.workoutId) {
        await scheduleApi.remove(e.id);
      }
    }
  } catch {
    // best-effort cleanup — the completedDayIds removal already succeeded
  }
}
