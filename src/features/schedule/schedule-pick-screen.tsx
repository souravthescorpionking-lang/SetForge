"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SchedulePickScreen — #/schedule/pick?date=YYYY-MM-DD (Part 5 → Part 10 §5.1).
//
//   TopBar (56)  : [◀] "Schedule for {Fri 2 Oct}" (back → history.back)
//   ScrollBody   : §5.1 sections (tapping a row creates the ScheduleEntry for
//                  the picked date, then history.back() + toast with Undo):
//                    "Current program"  — the ACTIVE routine's days (48px rows
//                                        "Day {k} · {name} · {m} exercises";
//                                        REST days disabled + labelled)
//                    "Your workouts"    — custom single workouts (Routine
//                                        kind=SESSION source=CUSTOM; 48px rows)
//                    "On demand"        — debounced server-side search
//                                        (q → GET /api/on-demand) + 48px rows;
//                                        custom workouts de-duplicated out
//   409 CONFLICT → the shared Replace confirm → retry with replace:true.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Dumbbell, Moon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { onDemandApi, routinesApi } from "@/lib/client/api";
import { qk, useCustomWorkouts, useDashboard } from "@/lib/client/query";
import { formatDayLabel } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import {
  goBackOrCalendar,
  useScheduleCreate,
  type ScheduleCreateArgs,
} from "./schedule-shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 32px section header — not a data-row (height law). */
function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
      {hint ? <span className="flex-none truncate normal-case tracking-normal text-muted-foreground/70">{hint}</span> : null}
    </h2>
  );
}

/** Shared 48px pick-row shell (tap = schedule; REST days render disabled). */
function PickRow({
  leading,
  label,
  trailing,
  disabled,
  ariaLabel,
  tour,
  onPick,
}: {
  leading: React.ReactNode;
  label: string;
  trailing: string;
  disabled?: boolean;
  ariaLabel: string;
  tour: TourDecl;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-row
      disabled={disabled}
      aria-label={ariaLabel}
      {...tourAttrs(tour)}
      onClick={onPick}
      className={cn(
        "flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left text-sm transition-colors",
        disabled
          ? "cursor-default border-border/60 text-muted-foreground/60"
          : "hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      {leading}
      <span className={cn("min-w-0 flex-1 truncate", !disabled && "font-medium")}>{label}</span>
      <span className="flex-none text-xs text-muted-foreground">{trailing}</span>
    </button>
  );
}

export default function SchedulePickScreen() {
  const route = useHashRoute();
  const dateParam = route.name === "schedule-pick" ? route.query.get("date") : null;
  const dateKey = dateParam && DATE_RE.test(dateParam) ? dateParam : undefined;

  const { create, conflictDialog } = useScheduleCreate();

  // ---------- section data ----------
  const dashboardQuery = useDashboard();
  const routinesQuery = useQuery({
    queryKey: qk.routines,
    queryFn: () => routinesApi.list(),
  });
  const customQuery = useCustomWorkouts();

  const activeRoutine = useMemo(() => {
    const active = dashboardQuery.data?.active ?? null;
    if (!active) return null;
    return (
      [...(routinesQuery.data?.routines ?? [])].find(
        (r) => r.id === active.routineId && (r.kind ?? "ROUTINE") !== "SESSION",
      ) ?? null
    );
  }, [dashboardQuery.data, routinesQuery.data]);

  const customWorkouts = useMemo(
    () => [...(customQuery.data?.workouts ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [customQuery.data],
  );
  const customRoutineIds = useMemo(() => new Set(customWorkouts.map((w) => w.id)), [customWorkouts]);

  // on-demand search — local input, DEBOUNCED value drives the server query
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const onDemandQuery = useQuery({
    queryKey: qk.onDemand(searchTerm ? { q: searchTerm } : {}),
    queryFn: () => onDemandApi.list(searchTerm ? { q: searchTerm } : {}),
  });
  const onDemandSessions = useMemo(
    () => (onDemandQuery.data ?? []).filter((s) => !customRoutineIds.has(s.id)),
    [onDemandQuery.data, customRoutineIds],
  );

  // ---------- the ONE schedule action (shared conflict/Undo flow) ----------
  const schedule = (args: Omit<ScheduleCreateArgs, "date" | "onSuccess"> & { date?: string }) => {
    const date = args.date ?? dateKey ?? new Date().toISOString().slice(0, 10);
    void create({
      ...args,
      date,
      onSuccess: () => goBackOrCalendar(date),
    });
  };

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "#/calendar";
  };

  const loading = routinesQuery.isLoading || dashboardQuery.isLoading;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              aria-label="Back"
              tour={{ id: "schedulePick.back", label: "Back", help: "Return to where you came from.", order: 10 }}
              onClick={back}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={dateKey ? `Schedule for ${formatDayLabel(dateKey)}` : "Schedule a workout"}
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* §5.1 section 1 — the CURRENT program's days */}
            {activeRoutine ? (
              <section className="flex flex-col gap-2" aria-label={`Days of ${activeRoutine.name}`}>
                <SectionHeader label="Current program" hint={activeRoutine.name} />
                {[...activeRoutine.days]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((day, i) => {
                    const isRest = (day.dayType ?? "WORKOUT") === "REST";
                    const exCount = day.exercises.length;
                    return (
                      <PickRow
                        key={day.id}
                        leading={
                          <>
                            <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">
                              Day {i + 1}
                            </span>
                            {isRest ? (
                              <Moon className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
                            ) : null}
                          </>
                        }
                        label={day.name}
                        trailing={isRest ? "Rest" : `${exCount} ${exCount === 1 ? "exercise" : "exercises"}`}
                        disabled={isRest || !dateKey}
                        ariaLabel={
                          isRest
                            ? `Day ${i + 1} ${day.name} — rest day`
                            : `Schedule ${activeRoutine.name} · ${day.name} for ${dateKey ?? "the picked date"}`
                        }
                        tour={{ id: "schedulePick.dayRow", label: "Program day row", help: "Schedule this program day on the picked date.", order: 20 }}
                        onPick={() =>
                          schedule({
                            routineId: activeRoutine.id,
                            dayId: day.id,
                            toastLabel: `Scheduled ${activeRoutine.name} · ${day.name} for ${
                              dateKey ? formatDayLabel(dateKey) : "today"
                            }`,
                          })
                        }
                      />
                    );
                  })}
              </section>
            ) : null}

            {/* §5.1 section 2 — custom workouts ("Your workouts") */}
            {customWorkouts.length > 0 ? (
              <section className="flex flex-col gap-2" aria-label="Your workouts">
                <SectionHeader label="Your workouts" />
                {customWorkouts.map((w) => (
                  <PickRow
                    key={w.id}
                    leading={<Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />}
                    label={w.name}
                    trailing={
                      w.estMinutes != null
                        ? `${w.exerciseCount} ${w.exerciseCount === 1 ? "exercise" : "exercises"} · ${w.estMinutes} min`
                        : `${w.exerciseCount} ${w.exerciseCount === 1 ? "exercise" : "exercises"}`
                    }
                    disabled={!dateKey}
                    ariaLabel={`Schedule ${w.name} for ${dateKey ?? "the picked date"}`}
                    tour={{ id: "schedulePick.customRow", label: "Your workout row", help: "Schedule a workout you built yourself.", order: 30 }}
                    onPick={() =>
                      schedule({
                        routineId: w.id,
                        toastLabel: `Scheduled ${w.name} for ${dateKey ? formatDayLabel(dateKey) : "today"}`,
                      })
                    }
                  />
                ))}
              </section>
            ) : null}

            {/* §5.1 section 3 — on-demand catalog (server-side search) */}
            <section className="flex flex-col gap-2" aria-label="On demand sessions">
              <SectionHeader label="On demand" hint="Search to filter" />
              <div
                data-row
                className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
              >
                <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search sessions"
                  aria-label="Search on-demand sessions"
                  {...tourAttrs({ id: "schedulePick.search", label: "On-demand search", help: "Filter the on-demand catalog by name or exercise.", order: 40 })}
                  className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {onDemandQuery.isLoading ? (
                <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading on-demand sessions">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : onDemandSessions.length === 0 ? (
                <div
                  data-row
                  className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
                >
                  {searchTerm
                    ? `No sessions match “${searchTerm}”`
                    : "No on-demand sessions yet — adopt one from the catalog"}
                </div>
              ) : (
                onDemandSessions.map((s) => (
                  <PickRow
                    key={s.id}
                    leading={<Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />}
                    label={s.name}
                    trailing={
                      s.minutes != null
                        ? `${s.seriesCount} ${s.seriesCount === 1 ? "series" : "series"} · ${s.minutes} min`
                        : `${s.seriesCount} ${s.seriesCount === 1 ? "series" : "series"}`
                    }
                    disabled={!dateKey}
                    ariaLabel={`Schedule ${s.name} for ${dateKey ?? "the picked date"}`}
                    tour={{ id: "schedulePick.sessionRow", label: "On-demand row", help: "Schedule an on-demand session on the picked date.", order: 50 }}
                    onPick={() =>
                      schedule({
                        routineId: s.id,
                        toastLabel: `Scheduled ${s.name} for ${dateKey ? formatDayLabel(dateKey) : "today"}`,
                      })
                    }
                  />
                ))
              )}
            </section>

            {!dateKey ? (
              <div
                role="status"
                className="flex h-12 flex-none items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-xs text-muted-foreground"
              >
                No date picked — open this screen via Schedule… on a program or a calendar day.
              </div>
            ) : null}

            {conflictDialog}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
