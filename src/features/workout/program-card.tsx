"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramCard — the Home card at the top of #/workout (Part 8 §3.1 → Part 9 §11).
//
// Layout (single-line rows, all [data-row]/nowrap; height varies with content):
//   R1 32px  "CURRENT PROGRAM" muted uppercase label ("SCHEDULED TODAY" when
//             a PLANNED entry for another routine drives today's card).
//   R2 40px  program name (bold, ellipsis) · "{daysDone} Days" accent pill
//             (only when the card's routine IS the followed program).
//   R3 32px  phase chips "P{n} {name}" — only when the program has >1 phase
//             (names + the ACTIVE phase highlight need the program DETAIL;
//             fetched only then — the catalog list row already gives the
//             count). Horizontally scrollable, display-only.
//   R4 32px  tagline muted single line (fallback: notes → day context).
//   R5 40px  THE primary CTA of the screen — exactly one per state:
//             in-progress   "Continue · {done}/{total} ✓"      → #/session
//             rest day      "Rest day — Mark off"              → cursor
//                            advance (programsApi.markRestDone).
//             following     "Start Day {n}"                     → start flow
//                            (POST start-day → #/session).
//             none          "Pick a program"                    → #/programs.
//   R6 40px  "See all" text link                                → #/programs.
//
// State resolution (dashboard payload + the in-progress session, priorities):
//   1. IN PROGRESS — an unfinished started session (any date) wins.
//   2. NONE        — no followed program and nothing scheduled today.
//   3/4. FOLLOWING/REST — today's resolution already prefers a PLANNED
//                    schedule entry over the cursor day (server-side).
//
// daysDone/tagline/phaseCount come from the screen's ["programs"] catalog rows
// (daysDone = completedDayIds ∪ days with finished workouts, server-computed
// for the followed program). The 4px left bar keeps the in-progress session's
// first group colour (primary otherwise).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { qk } from "@/lib/client/query";
import { programsApi } from "@/lib/client/api";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { ActionList } from "@/components/shared/action-list";
import { rowBase } from "@/lib/ui/tokens";
import { useChangeDifficulty } from "@/features/routines/use-change-difficulty";
import { resolveCardModel, useProgramCardActions } from "./program-card-model";
import type {
  DashboardDTO,
  ProgramSummaryDTO,
  RoutineDTO,
  WorkoutDTO,
} from "@/lib/types";

export type ProgramCardProps = {
  dashboard: DashboardDTO;
  /** The in-progress session (any date) — workoutsApi.active().workout. */
  activeWorkout: WorkoutDTO | null;
  /** Routine detail behind the card (screen-owned query; undefined while loading). */
  routine: RoutineDTO | undefined;
  /** Catalog rows from the screen's ["programs"] query (tagline/daysDone/phaseCount). */
  programs: ProgramSummaryDTO[] | undefined;
};

/** ~184px loading skeleton — same footprint as the card's common case (no CLS). */
export function ProgramCardSkeleton() {
  return (
    <div className="flex h-[184px] w-full flex-none overflow-hidden rounded-lg border bg-card" aria-busy="true" aria-hidden>
      <div className="w-1 flex-none bg-primary/40" />
      <div className="flex-1 animate-pulse bg-muted/30" />
    </div>
  );
}

export function ProgramCard({ dashboard, activeWorkout, routine, programs }: ProgramCardProps) {
  const navigate = useApp((s) => s.navigate);

  // §2 inline difficulty chip — the ONE shared change flow (same confirm modal
  // + server action as the Programs SubBar; see use-change-difficulty.tsx).
  const { difficulty, switching, confirm, request: changeDifficulty } = useChangeDifficulty();

  const model = useMemo(
    () => resolveCardModel(dashboard, activeWorkout, routine, programs),
    [dashboard, activeWorkout, routine, programs],
  );
  // Shared actions (start-day / rest-day mark-off) — program-card-model.ts.
  const actions = useProgramCardActions(model);
  const busy = actions.busy;

  // ---- phase chips (§11): the catalog row carries phaseCount at the user's
  // difficulty; chip NAMES + the active-phase highlight need the DETAIL, so it
  // is fetched only when the program actually has >1 phase. ----
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

  // "{daysDone} Days" pill — only when the card's routine IS the followed
  // program (the server computes daysDone for the followed program only).
  const followedRow = useMemo(
    () => programs?.find((p) => p.isFollowed) ?? null,
    [programs],
  );
  const daysDone = cardRow && followedRow && cardRow.id === followedRow.id ? cardRow.daysDone : null;

  // Header label: "Current program", or "Scheduled today" when a PLANNED
  // entry for another routine drives the card (the Part 8 scheduled-today
  // override keeps its semantics — the label just stays honest).
  const scheduledOverride =
    (model.state === "following" || model.state === "rest") &&
    dashboard.today.scheduled != null &&
    followedRow != null &&
    model.routineId !== followedRow.id;
  const headerLabel = scheduledOverride ? "Scheduled today" : "Current program";

  const startDay = async () => {
    await actions.startDay();
  };

  // §11 rest-day CTA — the shared mark-rest-done cursor flow (program-card-model.ts:
  // offline-aware, invalidates programs/schedule/dashboard, toasts errors).
  const markRestDone = async () => {
    await actions.markRestDone();
  };

  const barColour =
    model.state === "inprogress" && activeWorkout ? activeWorkout.groups[0]?.colour ?? null : null;

  const subtitle =
    model.state === "none"
      ? "Follow a routine to get a plan"
      : model.state === "inprogress"
        ? model.subtitle
        : (model.subtitle ?? null);

  return (
    <section aria-label="Program card" className="flex w-full flex-none overflow-hidden rounded-lg border bg-card">
      {/* 4px program/group colour bar */}
      <div
        className="w-1 flex-none bg-primary"
        style={barColour ? { backgroundColor: barColour } : undefined}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* R1 (32px) — muted header label */}
        <div data-row className={`${rowBase} flex-none px-4`}>
          <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-none tracking-wide text-muted-foreground">
            {headerLabel}
          </p>
        </div>
        {/* R2 (40px) — program name · "{daysDone} Days" pill · difficulty chip (§2) */}
        <div data-row className={`${rowBase} flex-none gap-2 px-4`}>
          <p className="min-w-0 flex-1 truncate text-base font-semibold leading-none">
            {model.state === "none" ? "No program selected" : model.programName}
          </p>
          {daysDone != null && daysDone > 0 ? (
            <span
              className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
              aria-label={`${daysDone} days completed`}
            >
              {daysDone} Days
            </span>
          ) : null}
          <ActionList
            label={`Difficulty — ${DIFFICULTY_LABELS[difficulty]}`}
            items={DIFFICULTIES.map((d) => ({
              id: d,
              label: DIFFICULTY_LABELS[d as Difficulty],
              checked: d === difficulty,
              onSelect: () => changeDifficulty(d as Difficulty),
            }))}
            trigger={
              <button
                type="button"
                {...tourAttrs({
                  id: "workout.difficultyChip",
                  label: "Difficulty chip",
                  help: "Switch the program difficulty without leaving Home.",
                  order: 10,
                })}
                disabled={switching}
                className={cn(
                  "flex h-8 max-w-[9.5rem] flex-none items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-none",
                  "text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  switching && "opacity-60",
                )}
              >
                <span className="truncate">{DIFFICULTY_LABELS[difficulty]}</span>
                <ChevronDown className="h-3.5 w-3.5 flex-none" aria-hidden />
              </button>
            }
          />
        </div>
        {/* R3 (32px) — phase chips, only when the program has >1 phase */}
        {phaseCount > 1 && phases && phases.length > 1 ? (
          <div
            data-row
            data-chip-scroller
            aria-label="Program phases"
            className="no-scrollbar flex h-8 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap px-4"
          >
            {phases.map((p, i) => (
              <span
                key={p.id}
                aria-current={activePhaseIdx === i || undefined}
                className={cn(
                  "flex h-6 flex-none items-center rounded-full border px-2 text-[11px] font-semibold leading-none",
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
          </div>
        ) : null}
        {/* R4 (32px) — tagline / context, muted single line */}
        {subtitle != null ? (
          <div data-row className={`${rowBase} flex-none px-4`}>
            <p className="min-w-0 flex-1 truncate text-sm leading-none text-muted-foreground">{subtitle}</p>
          </div>
        ) : null}
        {/* R5 (40px) — primary action row — the screen's ONE primary button */}
        <div data-row className={`${rowBase} flex-none px-3`}>
          {model.state === "none" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{ id: "workout.choose", label: "Pick a program", help: "Browse the catalog and follow your first program.", order: 10 }}
              onClick={() => navigate("/programs")}
            >
              Pick a program
            </Button>
          ) : model.state === "rest" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              disabled={busy}
              tour={{ id: "workout.markRest", label: "Mark off", help: "Complete today's rest day and advance the cursor.", order: 10 }}
              onClick={() => void markRestDone()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Rest day — Mark off
            </Button>
          ) : model.state === "following" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              disabled={busy || !model.routineId}
              tour={{ id: "workout.start", label: "Start day", help: "Create today's session from this day and jump into it.", order: 10 }}
              onClick={() => void startDay()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
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
              tour={{ id: "workout.continue", label: "Continue", help: "Jump back into the session you have in progress.", order: 10 }}
              onClick={() => navigate("/session")}
            >
              Continue · {model.completed}/{model.total} ✓
            </Button>
          )}
        </div>
        {/* R6 (40px) — "See all" text link → #/programs (§11) */}
        <div data-row className={`${rowBase} flex-none px-3`}>
          <button
            type="button"
            {...tourAttrs({
              id: "home.seeAll",
              label: "See all",
              help: "Browse every program and session in the catalog.",
              order: 40,
            })}
            onClick={() => navigate("/programs")}
            className="flex h-10 w-full items-center justify-center gap-1 rounded-md text-sm font-medium text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="truncate">See all</span>
            <ChevronRight className="h-4 w-4 flex-none" aria-hidden />
          </button>
        </div>
        {/* §2 difficulty-change confirm — the shared useChangeDifficulty modal */}
        {confirm ? <confirm.Dialog /> : null}
      </div>
    </section>
  );
}
