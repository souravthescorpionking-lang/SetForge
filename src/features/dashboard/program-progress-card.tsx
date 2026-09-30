"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramProgressCard — the §7 Dashboard tab's compact program card.
//
//   R1 32  "CURRENT PROGRAM" muted label
//   R2 40  program name · "{daysDone}/{daysTotal}" pill
//   —      4px accent progress bar, full width (daysDone/dayTotal)
//   R3 40  phase chips "P{n} {name}" (only when the variant has >1 phase;
//          active phase highlighted — same detail query as the Home card)
//   CTA 48 "Start Day {n}" | "Rest day — Mark off" | "Continue · d/t ✓" |
//          "Pick a program" — the SAME states/actions as the Home card
//          (useProgramCardActions — program-card-model.ts, never a fork).
//
// Tap the card (not the CTA) → #/dashboard/program (§7.1). No program →
// the card shows the empty state + "Pick a program" → #/programs.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { qk, usePrograms } from "@/lib/client/query";
import { programsApi } from "@/lib/client/api";
import {
  resolveCardModel,
  useProgramCardActions,
} from "@/features/workout/program-card-model";
import type { DashboardDTO, WorkoutDTO } from "@/lib/types";

export function ProgramProgressCardSkeleton() {
  return (
    <div className="flex h-[156px] w-full flex-none overflow-hidden rounded-lg border bg-card" aria-busy="true" aria-hidden>
      <div className="w-1 flex-none bg-primary/40" />
      <div className="flex-1 animate-pulse bg-muted/30" />
    </div>
  );
}

export function ProgramProgressCard({
  dashboard,
  activeWorkout,
  routine,
}: {
  dashboard: DashboardDTO;
  activeWorkout: WorkoutDTO | null;
  /** Routine detail behind the card (screen-owned query). */
  routine: Parameters<typeof resolveCardModel>[2];
}) {
  const navigate = useApp((s) => s.navigate);
  const programsQuery = usePrograms();
  const programs = programsQuery.data;

  const model = useMemo(
    () => resolveCardModel(dashboard, activeWorkout, routine, programs),
    [dashboard, activeWorkout, routine, programs],
  );
  const actions = useProgramCardActions(model);

  // Phase chips — same catalog row + detail query as the Home ProgramCard
  // (identical cache keys, so the two cards share one round trip).
  const cardRoutineId = model.state === "none" ? null : model.routineId;
  const cardRow = useMemo(
    () => (cardRoutineId ? (programs?.find((p) => p.id === cardRoutineId) ?? null) : null),
    [programs, cardRoutineId],
  );
  const phaseCount = cardRow?.phaseCount ?? 0;
  const detailQuery = useQuery({
    queryKey: qk.programDetail(cardRoutineId ?? ""),
    queryFn: () => programsApi.detail(cardRoutineId!),
    enabled: !!cardRoutineId && phaseCount > 1,
    staleTime: 30_000,
  });
  const phases =
    (detailQuery.data?.variant ?? detailQuery.data?.fallbackVariant)?.phases ?? null;
  const activePhaseIdx = detailQuery.data?.isCurrent ? detailQuery.data.cursorPhaseIdx : null;

  // "{daysDone}/{daysTotal}" pill — only when the card's routine IS the
  // followed program (the server computes daysDone for that one only).
  const followedRow = useMemo(
    () => programs?.find((p) => p.isFollowed) ?? null,
    [programs],
  );
  const daysDone =
    cardRow && followedRow && cardRow.id === followedRow.id ? cardRow.daysDone : null;
  const daysTotal = cardRow?.dayCount ?? null;
  const progressPct =
    daysDone != null && daysTotal != null && daysTotal > 0
      ? Math.min(100, Math.round((daysDone / daysTotal) * 100))
      : 0;

  const isNone = model.state === "none";

  return (
    <section aria-label="Program progress card" className="flex w-full flex-none overflow-hidden rounded-lg border bg-card">
      {/* 4px program accent bar */}
      <div className="w-1 flex-none bg-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* R1 (32px) — muted header label; whole card taps through to §7.1 */}
        <button
          type="button"
          {...tourAttrs({
            id: "dashboard.programCard",
            label: "Program card",
            help: "Your current program with days done and phase chips. Tap for full progress.",
            order: 10,
          })}
          onClick={() => navigate(isNone ? "/programs" : "/dashboard/program")}
          aria-label={
            isNone
              ? "No program selected — pick a program"
              : `${model.programName} progress — ${daysDone ?? 0} of ${daysTotal ?? 0} days done`
          }
          className="flex w-full flex-col overflow-hidden text-left transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
        >
          {/* R1 (32px) — "CURRENT PROGRAM" */}
          <span data-row className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-4">
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-none tracking-wide text-muted-foreground">
              Current program
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
          </span>
          {/* R2 (40px) — program name · "{daysDone}/{daysTotal}" pill */}
          <span data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-4">
            <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">
              {isNone ? "No program selected" : model.programName}
            </span>
            {!isNone && daysDone != null && daysTotal != null && daysTotal > 0 ? (
              <span
                className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
                aria-label={`${daysDone} of ${daysTotal} days done`}
              >
                {daysDone}/{daysTotal}
              </span>
            ) : null}
          </span>
          {/* R3 (4px full-width accent progress bar) */}
          <span className="flex h-1 w-full flex-none items-center overflow-hidden bg-muted/50">
            <span
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${isNone ? 0 : Math.max(progressPct, 2)}%` }}
            />
          </span>
          {/* R4 (40px) — phase chips (only when the variant has >1 phase) */}
          {phaseCount > 1 && phases && phases.length > 1 ? (
            <span
              data-row
              data-chip-scroller
              aria-label="Program phases"
              className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap px-4"
            >
              {phases.map((p, i) => (
                <span
                  key={p.id}
                  aria-current={activePhaseIdx === i || undefined}
                  className={cn(
                    "flex h-7 flex-none items-center rounded-full border px-2 text-[11px] font-semibold leading-none",
                    activePhaseIdx === i
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <span className="truncate">
                    P{i + 1} {p.name}
                  </span>
                </span>
              ))}
            </span>
          ) : null}
        </button>
        {/* CTA row (48px) — the shared card actions (same states as Home) */}
        <div data-row className="flex h-12 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3">
          {model.state === "none" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{
                id: "dashboard.pickProgram",
                label: "Pick a program",
                help: "Browse the catalog and follow your first program.",
                order: 20,
              }}
              onClick={() => navigate("/programs")}
            >
              Pick a program
            </Button>
          ) : model.state === "rest" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              disabled={actions.busy}
              tour={{
                id: "dashboard.markRest",
                label: "Mark off",
                help: "Complete today's rest day and advance the cursor.",
                order: 20,
              }}
              onClick={() => void actions.markRestDone()}
            >
              {actions.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Rest day — Mark off
            </Button>
          ) : model.state === "following" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              disabled={actions.busy || !model.routineId}
              tour={{
                id: "dashboard.startDay",
                label: "Start day",
                help: "Create today's session from this day and jump into it.",
                order: 20,
              }}
              onClick={() => void actions.startDay()}
            >
              {actions.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {model.isSession
                ? "Start session"
                : model.dayNumber != null
                  ? `Start Day ${model.dayNumber}`
                  : "Start workout"}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{
                id: "dashboard.continue",
                label: "Continue",
                help: "Jump back into the session you have in progress.",
                order: 20,
              }}
              onClick={() => navigate("/session")}
            >
              Continue · {model.completed}/{model.total} ✓
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
