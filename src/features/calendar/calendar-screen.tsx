"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CalendarScreen — #/calendar (Part 9 §6 evolution of the p3-6 screen).
//
//   TopBar (56)  : `◄ Sep 2026 ►` (scroll to the prev/next month; label tap =
//                  jump to the current month) | List/Month segmented toggle
//                  (48px, updates ?view=) | Filter icon-button (→
//                  #/calendar/filters; orange dot while filters are active)
//   SubBar (48)  : MONTH — the §6 legend row ("● Done · ○ Scheduled · ● Missed",
//                  colour-coded, muted) · LIST — applied-filters ChipRow while
//                  filters are active
//   ScrollBody   : MONTH — §6 CONTINUOUS vertical months (range =
//                  min(earliest schedule entry, now-2 months) → now+3 months;
//                  sticky 40px month headers; 40px day cells with status dots;
//                  SelectedDayPanel inline after the selected day's month)
//                  LIST — month-grouped 56px rows; tap → ?view=month&date=…
//
// On mount the §6 reconcile sweep runs (POST /api/schedule/reconcile-missed,
// fire-and-forget) and invalidates ["schedule"] (+ dashboard) when it
// resolves, so past PLANNED days without a workout settle to MISSED before
// the grid reads them. (There is no separate Part 5 midnight/timezone refresh
// hook client-side — the timezone rules run server-side on every schedule
// read; grep "refresh" in features/calendar + lib/client confirms none.)
//
// Route/query contract: #/calendar (?view=list|month — Month default;
// ?date=YYYY-MM-DD selects the day). Filter state is shared with the filters
// screen through filter-store (legacy sessionStorage persistence).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { ChevronLeft, ChevronRight, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { qk, useSchedule } from "@/lib/client/query";
import { exercisesApi, scheduleReconcileApi, workoutsApi } from "@/lib/client/api";
import { dayKeyOf, todayKey } from "@/lib/client/format";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import type { ProjectedDayDTO, ScheduleEntryDTO, WorkoutSummaryDTO } from "@/lib/types";
import { MonthView, monthId } from "./month-view";
import { ListView } from "./list-view";
import { SelectedDayPanel } from "./selected-day-panel";
import { FilterChipRow } from "./filter-chip-row";
import { useCalendarFilters } from "./filter-store";
import {
  applyFilters,
  countActiveFilters,
  exerciseMatchesFromHistory,
} from "./filter-state";
import { monthOf, monthRangeKeys, monthLabelShort, shiftAnchor, type MonthAnchor } from "./month-utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Earliest bound of the §6 schedule sweep (listSchedule defaults to -60d). */
const RANGE_FLOOR = "2000-01-01";

type View = "month" | "list";

/** The earlier of two month anchors. */
function earlierAnchor(a: MonthAnchor, b: MonthAnchor): MonthAnchor {
  if (a.year !== b.year) return a.year < b.year ? a : b;
  return a.month <= b.month ? a : b;
}

export default function CalendarScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const qc = useQueryClient();
  const filters = useCalendarFilters();

  // ---------- URL-derived state (?view= · ?date= — deep-linkable) ----------
  const viewParam = route.name === "calendar" ? route.query.get("view") : null;
  const view: View = viewParam === "list" ? "list" : "month";
  const dateParam = route.name === "calendar" ? route.query.get("date") : null;
  const selectedDay = dateParam && DATE_RE.test(dateParam) ? dateParam : todayKey();

  // ---------- §6 reconcile sweep (on mount; idempotent server-side) ----------
  useEffect(() => {
    let cancelled = false;
    scheduleReconcileApi
      .run()
      .then(() => {
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["schedule"] });
        qc.invalidateQueries({ queryKey: qk.dashboard });
      })
      .catch(() => {
        /* fire-and-forget — offline or transient failure is non-fatal */
      });
    return () => {
      cancelled = true;
    };
    // mount-only by design (the sweep is idempotent)
  }, [qc]);

  // ---------- §6 range: min(earliest entry, now-2 months) → now+3 months ----------
  const todayAnchor = useMemo(() => monthOf(todayKey()), []);
  const endAnchor = useMemo(() => shiftAnchor(todayAnchor, 3), [todayAnchor]);
  const { to: endKey } = monthRangeKeys(endAnchor);

  const scheduleQuery = useSchedule(RANGE_FLOOR, endKey);
  const entries = scheduleQuery.data?.entries ?? [];
  const earliestEntryKey = entries.length > 0 ? entries[0].date : null;
  const startAnchor = useMemo(
    () =>
      earliestEntryKey
        ? earlierAnchor(monthOf(earliestEntryKey), shiftAnchor(todayAnchor, -2))
        : shiftAnchor(todayAnchor, -2),
    [earliestEntryKey, todayAnchor],
  );
  const months = useMemo(() => {
    const out: MonthAnchor[] = [];
    for (
      let a = startAnchor;
      a.year < endAnchor.year || (a.year === endAnchor.year && a.month <= endAnchor.month);
      a = shiftAnchor(a, 1)
    ) {
      out.push(a);
    }
    return out;
  }, [startAnchor, endAnchor]);

  const { from: rangeFromKey } = monthRangeKeys(startAnchor);
  const workoutsQuery = useQuery({
    queryKey: qk.workoutList({ from: rangeFromKey, to: endKey }),
    queryFn: () => workoutsApi.list({ from: rangeFromKey, to: endKey }),
    enabled: view === "month",
  });

  // ---------- indexes ----------
  /** The range's workouts grouped per day key (panel rows + cell affordance). */
  const workoutsByDay = useMemo(() => {
    const byDay = new Map<string, WorkoutSummaryDTO[]>();
    for (const w of workoutsQuery.data?.workouts ?? []) {
      const key = dayKeyOf(w.date);
      const arr = byDay.get(key) ?? [];
      arr.push(w);
      byDay.set(key, arr);
    }
    return byDay;
  }, [workoutsQuery.data]);

  /** ALL schedule entries of the range grouped per day key (multi-entry days). */
  const entriesByDay = useMemo(() => {
    const m = new Map<string, ScheduleEntryDTO[]>();
    for (const e of entries) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [entries]);

  const projectedByDay = useMemo(() => {
    const m = new Map<string, ProjectedDayDTO>();
    for (const p of scheduleQuery.data?.projected ?? []) m.set(p.date, p);
    return m;
  }, [scheduleQuery.data]);

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

  // ---------- month scrolling (◄/► + jump-to-today + deep-link/list follow) ----------
  const [anchor, setAnchor] = useState<MonthAnchor>(() => monthOf(selectedDay));
  const [scrollAnchor, setScrollAnchor] = useState<MonthAnchor | null>(() =>
    dateParam && DATE_RE.test(dateParam) ? monthOf(dateParam) : null,
  );
  const monthsReady = !scheduleQuery.isLoading && months.length > 0;

  useEffect(() => {
    if (!monthsReady || !scrollAnchor) return;
    const el = document.getElementById(monthId(scrollAnchor));
    if (el) el.scrollIntoView({ block: "start" });
    setScrollAnchor(null);
  }, [monthsReady, scrollAnchor, view]);

  const scrollToAnchor = (target: MonthAnchor) => {
    setAnchor(target);
    setScrollAnchor(target);
  };

  const goToday = () => {
    setAnchor(todayAnchor);
    setScrollAnchor(todayAnchor);
    replaceHash(`#/calendar?view=month&date=${todayKey()}`);
  };

  const shiftMonth = (delta: number) => scrollToAnchor(shiftAnchor(anchor, delta));

  /** List-view pick: select the day AND follow it into the month grid. */
  const pickFromList = (dayKey: string) => {
    setScrollAnchor(monthOf(dayKey));
    setAnchor(monthOf(dayKey));
    selectDay(dayKey);
  };

  // ---------- data (legacy calendar-view list logic — unchanged) ----------
  const weekStart = settings?.weekStart === 0 ? 0 : 1;

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

  // ---------- render ----------
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
                tour={{ id: "calendar.prev", label: "Prev month", help: "Scroll the calendar back one month.", order: 10 }}
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
              <button
                type="button"
                onClick={goToday}
                aria-label={`Go to current month (${monthLabel})`}
                title="Jump to current month"
                {...tourAttrs({ id: "calendar.month", label: "Month label", help: "Tap the month name to jump back to the current month.", order: 20 })}
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
                tour={{ id: "calendar.next", label: "Next month", help: "Scroll the calendar forward one month.", order: 30 }}
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
                  {...tourAttrs({ id: "calendar.viewMonth", label: "Month view", help: "Switch to the scrolling month grid of day cells.", order: 40 })}
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
                  {...tourAttrs({ id: "calendar.viewList", label: "List view", help: "Browse every workout as a month-grouped list.", order: 50 })}
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
                tour={{ id: "calendar.filters", label: "Filters", help: "Open filters for categories, exercise and set conditions.", order: 60 }}
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

              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        view === "list" && activeCount > 0 ? (
          <SubBar>
            <FilterChipRow filters={filters} />
          </SubBar>
        ) : (
          <SubBar>
            {/* §6 legend — colour-coded dots + labels, muted */}
            <div
              data-row
              aria-label="Legend"
              className="flex h-8 w-full min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
            >
              <span className="flex flex-none items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                Done
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-primary bg-transparent" aria-hidden />
                Scheduled
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                Missed
              </span>
            </div>
          </SubBar>
        )
      }
    >
      <ScrollBody>
        {view === "month" ? (
          <MonthView
            months={months}
            weekStart={weekStart}
            workoutDays={new Set(workoutsByDay.keys())}
            entriesByDay={entriesByDay}
            projectedByDay={projectedByDay}
            selectedDay={selectedDay}
            loading={scheduleQuery.isLoading || workoutsQuery.isLoading}
            onSelect={selectDay}
            renderPanel={() => (
              <SelectedDayPanel
                dayKey={selectedDay}
                entries={entriesByDay.get(selectedDay) ?? []}
                workouts={workoutsByDay.get(selectedDay) ?? []}
              />
            )}
          />
        ) : (
          <ListView
            workouts={filteredWorkouts}
            loading={
              allQuery.isLoading || (!!filters.exerciseId && historyQuery.isLoading)
            }
            onPick={pickFromList}
          />
        )}
      </ScrollBody>
    </Screen>
  );
}
