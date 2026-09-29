"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OnDemandScreen — #/on-demand (Part 8 §3.6).
//
//   TopBar (56)  : BackButton(→ #/workout) · "On Demand" · 📅 (→ #/calendar) ·
//                  TopBarHelp
//   SubBar (48)  : search input "Search sessions…"
//   ScrollBody   : filter chip row 40 (All · ★ · ≤20m · ≤40m · up to 6 muscle
//                  chips derived from the loaded sessions) · 72px session rows
//                  (4px colour bar · name / `Chest, Triceps · 5 exercises` ·
//                  `{est} min` right · ★ favourite toggle) · loading skeletons
//                  at real heights · dashed empty state.
//
// On Demand content IS the SESSION-kind routines (Routine.kind === "SESSION"):
// the query/filter/row machinery is adapted from the routines-screen sessions
// tab (usePrograms("SESSION") + routinesApi.list() join). Metadata degrades
// silently: muscles fall back from day.primaryMuscles to the union of the
// exercises' primary muscles, and est minutes from routine/day estMinutes to a
// sets-based estimate (≈2.5 min/set, rounded to 5).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Dumbbell, Hammer, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsMetaApi, routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline, usePrograms } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import type { ProgramSummaryDTO, RoutineDTO, RoutineExerciseDTO } from "@/lib/types";
import { MUSCLE_LABELS, type Muscle } from "@/lib/constants";
import { errorMessage } from "@/features/routines/screen-helpers";

/** ≤20m / ≤40m duration chips. */
const DURATION_CHIPS = [20, 40] as const;
/** Muscle chips are derived from the loaded sessions — capped at 6 (§3.6). */
const MUSCLE_CHIP_CAP = 6;

const ROW_CLS =
  "flex h-18 cursor-pointer select-none items-center overflow-hidden whitespace-nowrap rounded-lg border bg-card pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const chipClass = (active: boolean) =>
  cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

const CHIP_ROW_CLS =
  "no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap";

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m;

/** Sessions are single-day: the first WORKOUT day carries the content. */
function sessionDayOf(routine: RoutineDTO | undefined) {
  if (!routine) return null;
  return routine.days.find((d) => (d.dayType ?? "WORKOUT") === "WORKOUT") ?? null;
}

/** Sets-based minute estimate (≈2.5 min per set incl. rest), rounded to 5. */
function estimateMinutes(exercises: RoutineExerciseDTO[]): number | null {
  const totalSets = exercises.reduce((n, re) => n + re.sets.length, 0);
  if (totalSets === 0) return null;
  return Math.max(5, Math.round((totalSets * 2.5) / 5) * 5);
}

type SessionMeta = {
  /** Estimated minutes (routine/day metadata, else derived from set count). */
  est: number | null;
  /** Display muscles: day.primaryMuscles, else the exercises' primary union. */
  muscles: string[];
  /** Exercise count of the session's workout day. */
  exerciseCount: number;
  /** Row colour bar: first exercise's category colour (data-backed). */
  barColour: string;
};

export default function OnDemandScreen() {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // ---------- data ----------
  const programsQuery = usePrograms("SESSION");
  const programs = useMemo(
    () => [...(programsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [programsQuery.data],
  );

  // full routine payloads — favourite state + day metadata join
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const routinesById = useMemo(() => {
    const m = new Map<string, RoutineDTO>();
    for (const r of routinesQuery.data?.routines ?? []) m.set(r.id, r);
    return m;
  }, [routinesQuery.data]);

  // ---------- ui state ----------
  const [searchInput, setSearchInput] = useState("");
  /** "ALL" | "FAV" | "M20" | "M40" | a muscle key ("CHEST"…) — muscle keys cannot collide with the sentinels. */
  const [chip, setChip] = useState<string>("ALL");

  // ---------- per-session derived meta ----------
  const sessionsMeta = useMemo(() => {
    const m = new Map<string, SessionMeta>();
    for (const p of programs) {
      const r = routinesById.get(p.id);
      const day = sessionDayOf(r);
      const exercises = day?.exercises ?? [];
      const dayMuscles = (day?.primaryMuscles ?? []).filter(Boolean);
      const muscles =
        dayMuscles.length > 0
          ? dayMuscles
          : [...new Set(exercises.flatMap((re) => re.exercise.primaryMuscles ?? []))];
      const est = r?.estMinutes ?? day?.estMinutes ?? estimateMinutes(exercises);
      m.set(p.id, {
        est,
        muscles,
        exerciseCount: exercises.length > 0 ? exercises.length : p.exerciseCount,
        barColour: exercises[0]?.exercise.category?.colour ?? "#f97316",
      });
    }
    return m;
  }, [programs, routinesById]);

  /** Muscle chip options derived from the loaded sessions (§3.6, ≤6). */
  const muscleOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of sessionsMeta.values()) for (const m of v.muscles) s.add(m);
    return [...s]
      .sort((a, b) => muscleLabel(a).localeCompare(muscleLabel(b)))
      .slice(0, MUSCLE_CHIP_CAP);
  }, [sessionsMeta]);

  // ---------- filtering ----------
  const visibleSessions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    const isMuscle = chip !== "ALL" && chip !== "FAV" && chip !== "M20" && chip !== "M40";
    return programs.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) {
        const notes = routinesById.get(p.id)?.notes ?? "";
        if (!notes.toLowerCase().includes(q)) return false;
      }
      const meta = sessionsMeta.get(p.id);
      if (chip === "FAV" && !(routinesById.get(p.id)?.isFavorite ?? false)) return false;
      if (chip === "M20" && !(meta?.est != null && meta.est <= 20)) return false;
      if (chip === "M40" && !(meta?.est != null && meta.est <= 40)) return false;
      if (isMuscle && !(meta?.muscles ?? []).includes(chip)) return false;
      return true;
    });
  }, [programs, searchInput, chip, sessionsMeta, routinesById]);

  // ---------- mutations ----------
  const toggleFavourite = async (program: ProgramSummaryDTO) => {
    const current = routinesById.get(program.id)?.isFavorite ?? false;
    const next = !current;
    // optimistic patch of the routines cache (the list reads isFavorite from it)
    qc.setQueryData<{ routines: RoutineDTO[] }>(qk.routines, (old) =>
      old
        ? { ...old, routines: old.routines.map((r) => (r.id === program.id ? { ...r, isFavorite: next } : r)) }
        : old,
    );
    if (!online) {
      queueMutation(
        `/api/programs/${program.id}/meta`,
        "PUT",
        { isFavorite: next },
        next ? "Added to favourites" : "Removed from favourites",
      );
      toast.info(
        `${next ? "Added to favourites" : "Removed from favourites"} — saved offline, will sync when reconnected`,
      );
      return;
    }
    try {
      await programsMetaApi.update(program.id, { isFavorite: next });
      invalidate.routines();
      toast.success(
        next ? `“${program.name}” added to favourites` : `“${program.name}” removed from favourites`,
      );
    } catch (e) {
      invalidate.routines();
      toast.error(errorMessage(e));
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setChip("ALL");
  };

  // ---------- rows ----------
  const renderStar = (program: ProgramSummaryDTO, isFav: boolean) => (
    <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        className={cn("h-11 w-11 p-0", isFav && "text-amber-500 hover:text-amber-500")}
        aria-pressed={isFav}
        aria-label={isFav ? `Unfavourite ${program.name}` : `Favourite ${program.name}`}
        tour={{ id: "onDemand.favourite", label: "Favourite", help: "Star the session to find it faster.", order: 70 }}
        onClick={() => void toggleFavourite(program)}
      >
        <Star className="h-5 w-5" aria-hidden fill={isFav ? "currentColor" : "none"} />
      </Button>
    </span>
  );

  const renderSessionRow = (program: ProgramSummaryDTO) => {
    const meta = sessionsMeta.get(program.id);
    const isFav = routinesById.get(program.id)?.isFavorite ?? false;
    const muscles = meta?.muscles ?? [];
    const count = meta?.exerciseCount ?? 0;

    const line2 = [
      ...(muscles.length > 0 ? [muscles.map(muscleLabel).join(", ")] : []),
      `${count} ${count === 1 ? "exercise" : "exercises"}`,
    ].join(" · ");

    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${meta?.est != null ? `${meta.est} minutes, ` : ""}${count} exercises`}
        {...tourAttrs({ id: "onDemand.sessionRow", label: "Session row", help: "Open the session to see its groups and start it.", order: 60 })}
        className={ROW_CLS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(`/on-demand/${program.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/on-demand/${program.id}`);
          }
        }}
      >
        <span aria-hidden className="w-1 flex-none self-stretch" style={{ backgroundColor: meta?.barColour ?? "#f97316" }} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pl-2">
          <span className="truncate text-sm font-semibold leading-none">{program.name}</span>
          <span className="truncate text-xs leading-none text-muted-foreground">{line2}</span>
        </div>
        {meta?.est != null ? (
          <span className="flex-none pr-2 text-xs font-semibold tabular-nums leading-none text-muted-foreground">
            {meta.est} min
          </span>
        ) : null}
        {renderStar(program, isFav)}
      </div>
    );
  };

  const empty = !programsQuery.isLoading && programs.length === 0;
  const filteredEmpty =
    !programsQuery.isLoading && programs.length > 0 && visibleSessions.length === 0;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="On Demand"
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          actions={
            <>
              <button
                type="button"
                {...tourAttrs({ id: "onDemand.calendar", label: "Calendar", help: "Open the month calendar and schedule.", order: 10 })}
                aria-label="Calendar"
                onClick={() => navigate("/calendar")}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
              </button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          <div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-input bg-transparent pl-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:bg-input/30">
            <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search sessions…"
              aria-label="Search sessions"
              {...tourAttrs({ id: "onDemand.search", label: "Search sessions", help: "Filter the sessions by name or notes.", order: 10 })}
              className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        </SubBar>
      }
    >
      <ScrollBody>
        {/* §3.6 filter chips: All · ★ · ≤20m · ≤40m · muscle chips (derived) */}
        <div data-row data-chip-scroller role="group" aria-label="Session filters" className={CHIP_ROW_CLS}>
          <button
            type="button"
            aria-pressed={chip === "ALL"}
            className={chipClass(chip === "ALL")}
            {...tourAttrs({ id: "onDemand.filterAll", label: "All filter", help: "Clear every filter to show all sessions.", order: 20 })}
            onClick={() => setChip("ALL")}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={chip === "FAV"}
            className={chipClass(chip === "FAV")}
            {...tourAttrs({ id: "onDemand.filterFavourites", label: "Favourites filter", help: "Show only the sessions you starred.", order: 30 })}
            onClick={() => setChip("FAV")}
          >
            <Star className="h-3.5 w-3.5" aria-hidden fill={chip === "FAV" ? "currentColor" : "none"} />
            Favourites
          </button>
          {DURATION_CHIPS.map((m) => {
            const key = `M${m}`;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={chip === key}
                className={chipClass(chip === key)}
                {...tourAttrs(
                  m === 20
                    ? { id: "onDemand.filter20", label: "≤20m filter", help: "Sessions estimated at 20 minutes or less.", order: 40 }
                    : { id: "onDemand.filter40", label: "≤40m filter", help: "Sessions estimated at 40 minutes or less.", order: 50 },
                )}
                onClick={() => setChip(key)}
              >
                ≤{m}m
              </button>
            );
          })}
          {muscleOptions.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={chip === m}
              className={chipClass(chip === m)}
              {...tourAttrs({ skipTour: true, reason: "Data-driven muscle filter chips derived from the loaded sessions" })}
              onClick={() => setChip(m)}
            >
              {muscleLabel(m)}
            </button>
          ))}
        </div>

        {programsQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading sessions">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Dumbbell className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="max-w-[280px] text-center text-sm font-semibold">
              No sessions yet — create one in the Builder
            </p>
            <Button
              type="button"
              className="gap-1.5"
              tour={{ id: "onDemand.openBuilder", label: "Open Builder", help: "Go to the Builder to create a session.", order: 80, when: ["empty"] }}
              onClick={() => navigate("/builder")}
            >
              <Hammer className="h-4 w-4" aria-hidden />
              Open Builder
            </Button>
          </div>
        ) : filteredEmpty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Nothing matches these filters</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              tour={{ id: "onDemand.clearFilters", label: "Clear filters", help: "Reset the filters when nothing matches.", order: 90 }}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleSessions.map((program) => renderSessionRow(program))}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
