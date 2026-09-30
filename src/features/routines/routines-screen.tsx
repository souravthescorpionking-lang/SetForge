"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramsScreen — #/programs (Part 9 §3 — PROGRAMS CATALOG).
//
//   TopBar (56)  : BackButton → #/workout · "Programs" · `+` → #/builder ·
//                  TopBarHelp. NO calendar icon (that's Dashboard's).
//   SubBar (48)  : difficulty segmented control — Beginner | Intermediate |
//                  Advanced, equal thirds. Tapping a different difficulty
//                  while a program is followed opens the §2 confirm
//                  ("Change difficulty" / "From {old} to {new}. Current program
//                  restarts at Phase 1 Day 1." Cancel · Confirm); with no
//                  active program the switch applies silently.
//   ScrollBody   : catalog cards (48 header + 32 tagline + 40 meta; the
//                  tagline row hides when empty → card shrinks to 88px):
//     R1 (48) name · "{daysDone} Days" pill (accent, current only) ·
//          "{weeks} WEEKS" pill (hidden when weeks null)
//     R2 (32) tagline muted (fallback: notes first line; hidden when empty)
//     R3 (40) "{phaseCount} phases · {daysPerWeek} d/wk" · right "· {dayCount} days"
//          No variant at the difficulty → whole card dimmed (opacity-60) +
//          R3 "Not available at {difficulty}".
//   Current program → 4px accent left bar. Tap → #/programs/{id}.
//
// Difficulty source of truth = ["session"] query (user.difficulty); the
// segmented control may flip optimistically and reconciles once the server
// cache catches up. Catalog data = GET /api/programs?kind=ROUTINE&difficulty=
// (variant-scoped phaseCount/daysPerWeek/dayCount per card).
//
// Stripped vs Part 8 §3.5: filter chips (difficulty/favourites/labels),
// per-row Follow/star/⋮ menus (the detail screen owns those actions now),
// the Following row (the current program IS a catalog card, accent-barred).
// Kept: Builder entry points (TopBar `+` + empty state), replace-free UX.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Hammer, Layers, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { usePrograms } from "@/lib/client/query";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { useChangeDifficulty } from "./use-change-difficulty";
import type { ProgramSummaryDTO } from "@/lib/types";

/** R2 fallback: first line of the routine notes when no tagline exists. */
function taglineOf(program: ProgramSummaryDTO): string {
  const t = (program.tagline ?? "").trim();
  if (t) return t;
  const notes = (program.notes ?? "").trim();
  return notes ? (notes.split("\n")[0] ?? "") : "";
}

export default function RoutinesScreen() {
  const navigate = useApp((s) => s.navigate);

  // ---------- §2 difficulty switch — the ONE shared flow (also used by the
  // Home program-card chip; see use-change-difficulty.tsx) ----------
  const { difficulty: selectedDifficulty, switching, confirm, request: onDifficultyTap } = useChangeDifficulty();

  // ---------- data ----------
  const catalogQuery = usePrograms("ROUTINE", selectedDifficulty);
  const programs = useMemo(
    () => [...(catalogQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [catalogQuery.data],
  );

  // ---------- render ----------
  const empty = !catalogQuery.isLoading && programs.length === 0;

  const renderCard = (program: ProgramSummaryDTO) => {
    const variantMissing = !program.variantExists;
    const tagline = taglineOf(program);
    const weeks = program.weeks != null && program.weeks > 0 ? program.weeks : null;
    return (
      <div
        key={program.id}
        role="button"
        tabIndex={0}
        aria-label={`${program.name}${variantMissing ? ` — not available at ${DIFFICULTY_LABELS[selectedDifficulty]}` : ` — ${program.phaseCount} phases, ${program.daysPerWeek ?? "?"} days per week`}${program.isFollowed ? " — current program" : ""}`}
        {...tourAttrs({ id: "programs.card", label: "Program card", help: "Open the program to preview its phases and days.", order: 30, when: ["populated"] })}
        className={cn(
          "relative flex-none cursor-pointer select-none overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          variantMissing && "opacity-60",
        )}
        onClick={() => navigate(`/programs/${program.id}`)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/programs/${program.id}`);
          }
        }}
      >
        {/* 4px accent bar — the current program (colour = left bar only) */}
        {program.isFollowed ? <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden /> : null}
        {/* R1 (48) — name · daysDone pill (current) · weeks pill */}
        <div data-row className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap pl-3 pr-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold leading-none", variantMissing && "text-muted-foreground")}>
            {program.name}
          </span>
          {program.isFollowed ? (
            <span
              className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
              aria-label={`${program.daysDone} days completed`}
            >
              {program.daysDone} Days
            </span>
          ) : null}
          {weeks != null ? (
            <span className="flex h-6 flex-none items-center rounded-full border border-border px-2 text-[10px] font-bold uppercase leading-none text-muted-foreground">
              {weeks} Weeks
            </span>
          ) : null}
        </div>
        {/* R2 (32) — tagline (hides when empty; card shrinks gracefully) */}
        {tagline ? (
          <div data-row className="flex h-8 w-full items-center overflow-hidden whitespace-nowrap pl-3 pr-2">
            <span className="min-w-0 flex-1 truncate text-xs leading-none text-muted-foreground">{tagline}</span>
          </div>
        ) : null}
        {/* R3 (40) — variant meta · day count */}
        <div data-row className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap pl-3 pr-3">
          <span className="min-w-0 flex-1 truncate text-xs leading-none text-muted-foreground">
            {variantMissing
              ? `Not available at ${DIFFICULTY_LABELS[selectedDifficulty]}`
              : `${program.phaseCount} ${program.phaseCount === 1 ? "phase" : "phases"}${program.daysPerWeek != null ? ` · ${program.daysPerWeek} d/wk` : ""}`}
          </span>
          <span className="flex-none text-xs leading-none text-muted-foreground">· {program.dayCount} days</span>
        </div>
      </div>
    );
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          title="Programs"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Create a program"
                tour={{ id: "programs.create", label: "Create", help: "Open the Builder to create a program or session.", order: 10 }}
                onClick={() => navigate("/builder")}
              >
                <Plus className="h-5 w-5" aria-hidden />
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          {/* Equal-thirds segmented control — border-frame pattern (records-tab):
              grid-cols-3 + h-full cells, no inner padding (p-1 + h-8 pills overflow
              the 40px border-box by 2px → harness nowrapFail). Selected = accent. */}
          <div
            data-row
            role="radiogroup"
            aria-label="Difficulty"
            className="grid h-10 w-full grid-cols-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card"
          >
            {DIFFICULTIES.map((d) => {
              const selected = selectedDifficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Difficulty: ${DIFFICULTY_LABELS[d]}`}
                  {...tourAttrs({ id: "programs.difficulty", label: "Difficulty", help: "Switch every program between beginner, intermediate and advanced.", order: 20 })}
                  className={cn(
                    "flex h-full min-w-0 items-center justify-center overflow-hidden text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
                    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  onClick={() => onDifficultyTap(d)}
                  disabled={switching && !selected}
                >
                  {switching && selected ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <span className="truncate">{DIFFICULTY_LABELS[d]}</span>
                  )}
                </button>
              );
            })}
          </div>
        </SubBar>
      }
    >
      <ScrollBody contentClassName="">
        {catalogQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">No programs yet</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Programs are built in the Builder — start one to drive your daily workouts.
            </p>
            <Button
              type="button"
              className="gap-1.5"
              tour={{ id: "programs.createFirst", label: "Open Builder", help: "Create your first program in the Builder.", order: 160, when: ["empty"] }}
              onClick={() => navigate("/builder")}
            >
              <Hammer className="h-4 w-4" aria-hidden />
              Open the Builder
            </Button>
          </div>
        ) : (
          programs.map((program) => renderCard(program))
        )}

        {/* §2 destructive confirm — the shared useChangeDifficulty modal */}
        {confirm ? <confirm.Dialog /> : null}
      </ScrollBody>
    </Screen>
  );
}
