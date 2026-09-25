"use client";

// Calendar feature entry: month grid (default) + list view, day sheet, filters.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/page-header";
import { useApp, qk } from "@/lib/client/query";
import { workoutsApi, exercisesApi } from "@/lib/client/api";
import { dayKeyOf, formatMonthYear, todayKey } from "@/lib/client/format";
import { CalendarDays, ChevronLeft, ChevronRight, CircleDot, List, SkipBack, SkipForward, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { MonthGrid, type MonthAnchor } from "./month-grid";
import { DaySheet } from "./day-sheet";
import { WorkoutList, type DisplayMode } from "./workout-list";
import { FiltersBar } from "./filters";
import {
  applyFilters,
  exerciseMatchesFromHistory,
  indexByDay,
  loadFilters,
  saveFilters,
  type CalendarFilters,
} from "./filter-state";

type Mode = "month" | "list";

function nowAnchor(): MonthAnchor {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

export function CalendarView() {
  const settings = useApp((s) => s.settings);
  const weekStart = settings?.weekStart === 0 ? 0 : 1;

  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<MonthAnchor>(nowAnchor);
  const [direction, setDirection] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [singleDot, setSingleDot] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("dots");
  const [filters, setFilters] = useState<CalendarFilters>(() => loadFilters());

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  // month range (day keys, UTC)
  const fromKey = useMemo(
    () => dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month, 1))),
    [anchor],
  );
  const toKey = useMemo(
    () => dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month + 1, 0))),
    [anchor],
  );

  const monthQuery = useQuery({
    queryKey: qk.workoutList({ from: fromKey, to: toKey }),
    queryFn: () => workoutsApi.list({ from: fromKey, to: toKey }),
  });

  const allQuery = useQuery({
    queryKey: qk.workoutList({}),
    queryFn: () => workoutsApi.list(),
  });

  const historyQuery = useQuery({
    queryKey: qk.exerciseHistory(filters.exerciseId ?? ""),
    queryFn: () => exercisesApi.history(filters.exerciseId!, 500),
    enabled: !!filters.exerciseId,
  });

  const byDay = useMemo(
    () => indexByDay(monthQuery.data?.workouts ?? []),
    [monthQuery.data],
  );

  const allWorkouts = useMemo(() => allQuery.data?.workouts ?? [], [allQuery.data]);

  const exerciseMatches = useMemo(
    () => exerciseMatchesFromHistory(historyQuery.data, filters),
    [historyQuery.data, filters],
  );

  const filteredWorkouts = useMemo(
    () => applyFilters(allWorkouts, filters, exerciseMatches),
    [allWorkouts, filters, exerciseMatches],
  );

  // nearest workout strictly before/after the visible month
  const jumpTargets = useMemo(() => {
    const dates = allWorkouts.map((w) => dayKeyOf(w.date)).sort();
    let prev: string | null = null;
    let next: string | null = null;
    for (const d of dates) {
      if (d < fromKey) prev = d; // sorted asc → last one below range wins
      if (d > toKey && !next) next = d;
    }
    return { prev, next };
  }, [allWorkouts, fromKey, toKey]);

  const shiftMonth = (delta: number) => {
    setDirection(delta);
    setAnchor((a) => {
      const d = new Date(Date.UTC(a.year, a.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  };

  const goToday = () => {
    setDirection(0);
    const today = todayKey();
    setAnchor(nowAnchor());
    setSelectedDay(today);
  };

  const jumpTo = (dayKey: string) => {
    const d = new Date(`${dayKey}T00:00:00.000Z`);
    setDirection(d.getUTCFullYear() * 12 + d.getUTCMonth() > anchor.year * 12 + anchor.month ? 1 : -1);
    setAnchor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    setSelectedDay(dayKey);
    setSheetOpen(true);
  };

  const openDay = (dayKey: string) => {
    setSelectedDay(dayKey);
    setSheetOpen(true);
  };

  const monthCount = monthQuery.data?.workouts.length ?? 0;
  const monthLabel = formatMonthYear(new Date(Date.UTC(anchor.year, anchor.month, 1)));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CalendarDays className="h-5 w-5" />}
        title="Calendar"
        subtitle="Workout days at a glance — plan, review and jump back in."
        actions={
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => {
              if (v) setMode(v as Mode);
            }}
            variant="outline"
            className="gap-1"
          >
            <ToggleGroupItem value="month" aria-label="Month view" className="gap-1.5 px-3">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Month</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="gap-1.5 px-3">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        {mode === "month" ? (
          <motion.div
            key="month"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* month nav + stats bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 sm:p-3">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Next month"
                  onClick={() => shiftMonth(1)}
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </Button>
              </div>
              <h2 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight sm:text-lg">
                {monthLabel}
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="numeric gap-1">
                  {monthCount} workout{monthCount === 1 ? "" : "s"}
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Jump to previous workout"
                      disabled={!jumpTargets.prev}
                      onClick={() => jumpTargets.prev && jumpTo(jumpTargets.prev)}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous workout</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Jump to next workout"
                      disabled={!jumpTargets.next}
                      onClick={() => jumpTargets.next && jumpTo(jumpTargets.next)}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next workout</TooltipContent>
                </Tooltip>
                <Button variant="secondary" size="sm" className="h-9 px-3" onClick={goToday}>
                  Today
                </Button>
                <button
                  type="button"
                  aria-pressed={singleDot}
                  aria-label="Toggle single dot indicator"
                  onClick={() => setSingleDot((v) => !v)}
                  className={cn(
                    "flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                    singleDot
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Single dot</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-2.5 sm:p-4">
              <MonthGrid
                anchor={anchor}
                weekStart={weekStart}
                byDay={byDay}
                selectedDay={selectedDay}
                onSelect={openDay}
                singleDot={singleDot}
                loading={monthQuery.isLoading}
                direction={direction}
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Tap a day to see its workout
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 sm:p-3">
              <FiltersBar filters={filters} onChange={setFilters} />
              <div className="ms-auto flex items-center gap-1">
                {(["dots", "names", "sets"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={displayMode === m}
                    onClick={() => setDisplayMode(m)}
                    className={cn(
                      "h-8 rounded-lg border px-2.5 text-xs font-semibold capitalize transition-colors",
                      displayMode === m
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <WorkoutList
              workouts={filteredWorkouts}
              loading={allQuery.isLoading || (!!filters.exerciseId && historyQuery.isLoading)}
              displayMode={displayMode}
              onPick={openDay}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <DaySheet dayKey={selectedDay} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
