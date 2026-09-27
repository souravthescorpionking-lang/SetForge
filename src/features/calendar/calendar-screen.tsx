"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CalendarScreen — #/calendar (p3-6). Composed ONLY from the layout primitives
// + the ONE ExerciseCard (via SelectedDayPanel).
//
//   TopBar (56)  : `◄ Sep 2026 ►` (44px buttons either side of the month label
//                  — label tap = jump to current month) | List/Month segmented
//                  toggle (48px, updates ?view=) | Filter icon-button (→
//                  #/calendar/filters; orange dot while filters are active)
//   SubBar (48)  : applied-filters ChipRow (40px chips with X per filter) —
//                  only while any filter is active (the one allowed extra,
//                  horizontal scroller)
//   ScrollBody   : MONTH — 32px weekday row + FIXED 6×7 grid (56px cells) →
//                  SelectedDayPanel (48px computed date header + summary cards
//                  that expand inline to read/SetRows — NO day-sheet Dialog)
//                  LIST — month-grouped 56px rows (date 96px | names "·" |
//                  count 40px); tap → ?view=month&date=…
//
// Route/query contract: #/calendar (?view=list|month — Month default;
// ?date=YYYY-MM-DD selects the day and drives the SelectedDayPanel). All
// state is URL-derived; month paging is local view state that follows the
// selected day across months. Filter state is shared with the filters screen
// through filter-store (legacy sessionStorage persistence).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { qk, useSchedule } from "@/lib/client/query";
import { exercisesApi, workoutsApi } from "@/lib/client/api";
import { todayKey } from "@/lib/client/format";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import type { CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import type { ProjectedDayDTO, ScheduleEntryDTO } from "@/lib/types";
import { MonthView } from "./month-view";
import { ListView } from "./list-view";
import { SelectedDayPanel } from "./selected-day-panel";
import { FilterChipRow } from "./filter-chip-row";
import { useCalendarFilters } from "./filter-store";
import {
  applyFilters,
  countActiveFilters,
  exerciseMatchesFromHistory,
  indexByDay,
} from "./filter-state";
import { monthOf, monthRangeKeys, monthLabelShort, shiftAnchor, type MonthAnchor } from "./month-utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type View = "month" | "list";

export default function CalendarScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const filters = useCalendarFilters();

  // ---------- URL-derived state (?view= · ?date= — deep-linkable) ----------
  const viewParam = route.name === "calendar" ? route.query.get("view") : null;
  const view: View = viewParam === "list" ? "list" : "month";
  const dateParam = route.name === "calendar" ? route.query.get("date") : null;
  const selectedDay = dateParam && DATE_RE.test(dateParam) ? dateParam : todayKey();

  // anchor month — DERIVED from the selected day's month, plus a paging
  // override that stays valid only while the URL day is unchanged (paging
  // ◄/► never touches the URL; any date change — cell tap, list pick, deep
  // link, "today" — naturally resets the anchor to that day's month).
  const baseAnchor = useMemo(() => monthOf(selectedDay), [selectedDay]);
  const [paged, setPaged] = useState<{ day: string; anchor: MonthAnchor } | null>(null);
  const anchor = paged && paged.day === selectedDay ? paged.anchor : baseAnchor;

  // ---------- URL writers (replaceHash: deep-linkable, no history pollution) ----------
  const setView = (next: View) => {
    if (next === view) return;
    const params = new URLSearchParams();
    params.set("view", next);
    if (dateParam && DATE_RE.test(dateParam)) params.set("date", dateParam);
    replaceHash(`#/calendar?${params.toString()}`);
  };

  const selectDay = (dayKey: string) => {
    if (dayKey === selectedDay) return;
    replaceHash(`#/calendar?view=month&date=${dayKey}`);
  };

  const goToday = () => {
    setPaged(null);
    replaceHash(`#/calendar?view=month&date=${todayKey()}`);
  };

  const shiftMonth = (delta: number) => setPaged({ day: selectedDay, anchor: shiftAnchor(anchor, delta) });

  // ---------- data (legacy calendar-view query logic) ----------
  const weekStart = settings?.weekStart === 0 ? 0 : 1;
  const { from: fromKey, to: toKey } = monthRangeKeys(anchor);

  const monthQuery = useQuery({
    queryKey: qk.workoutList({ from: fromKey, to: toKey }),
    queryFn: () => workoutsApi.list({ from: fromKey, to: toKey }),
  });
  const byDay = useMemo(() => indexByDay(monthQuery.data?.workouts ?? []), [monthQuery.data]);

  // Part 5: schedule entries + projected ghosts for the visible month
  const scheduleQuery = useSchedule(fromKey, toKey);
  const entryByDay = useMemo(() => {
    const m = new Map<string, ScheduleEntryDTO>();
    for (const e of scheduleQuery.data?.entries ?? []) {
      const prev = m.get(e.date);
      // prefer PLANNED entries when several land on one day
      if (!prev || (e.status === "PLANNED" && prev.status !== "PLANNED")) m.set(e.date, e);
    }
    return m;
  }, [scheduleQuery.data]);
  const projectedByDay = useMemo(() => {
    const m = new Map<string, ProjectedDayDTO>();
    for (const p of scheduleQuery.data?.projected ?? []) m.set(p.date, p);
    return m;
  }, [scheduleQuery.data]);

  const allQuery = useQuery({
    queryKey: qk.workoutList({}),
    queryFn: () => workoutsApi.list(),
    enabled: view === "list",
  });

  const historyQuery = useQuery({
    queryKey: qk.exerciseHistory(filters.exerciseId ?? ""),
    queryFn: () => exercisesApi.history(filters.exerciseId!, 500),
    enabled: view === "list" && !!filters.exerciseId,
  });

  const filteredWorkouts = useMemo(
    () =>
      applyFilters(
        allQuery.data?.workouts ?? [],
        filters,
        exerciseMatchesFromHistory(historyQuery.data, filters),
      ),
    [allQuery.data, filters, historyQuery.data],
  );

  const activeCount = countActiveFilters(filters);
  const monthLabel = monthLabelShort(anchor);

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
              <button
                type="button"
                onClick={goToday}
                aria-label={`Go to current month (${monthLabel})`}
                title="Jump to current month"
                className="min-w-0 max-w-[150px] truncate rounded-md px-2 py-2 text-sm font-semibold transition-colors hover:bg-accent"
              >
                {monthLabel}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          }
          title={<span className="sr-only">Calendar</span>}
          actions={
            <>
              {/* List/Month segmented toggle — 48px, updates ?view= */}
              <div
                role="tablist"
                aria-label="Calendar view"
                className="flex h-12 flex-none items-center rounded-lg border bg-card"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "month"}
                  onClick={() => setView("month")}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center gap-1.5 rounded-l-md text-sm font-semibold transition-colors sm:w-auto sm:px-3",
                    view === "month"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Month</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "list"}
                  onClick={() => setView("list")}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center gap-1.5 rounded-r-md border-l border-border text-sm font-semibold transition-colors sm:w-auto sm:px-3",
                    view === "list"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <List className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-11 w-11 flex-none"
                aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"}
                onClick={() => navigate("/calendar/filters")}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
                {activeCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                  />
                ) : null}
              </Button>
            </>
          }
        />
      }
      subBar={
        activeCount > 0 ? (
          <SubBar>
            <FilterChipRow filters={filters} />
          </SubBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {view === "month" ? (
          <>
            <MonthView
              anchor={anchor}
              weekStart={weekStart}
              byDay={byDay}
              entryByDay={entryByDay}
              projectedByDay={projectedByDay}
              selectedDay={selectedDay}
              loading={monthQuery.isLoading}
              onSelect={selectDay}
            />
            <SelectedDayPanel
              dayKey={selectedDay}
              summary={byDay.get(selectedDay)}
              entry={entryByDay.get(selectedDay)}
              visibleColumns={visibleColumns}
            />
          </>
        ) : (
          <ListView
            workouts={filteredWorkouts}
            loading={
              allQuery.isLoading || (!!filters.exerciseId && historyQuery.isLoading)
            }
            onPick={selectDay}
          />
        )}
      </ScrollBody>
    </Screen>
  );
}
