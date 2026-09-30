"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogsScreen — #/logs (Part 9 §8 Workout Logs).
//
//   TopBar (56)  : BackButton(→ #/workout) · "Logs" · list⇄calendar toggle
//                  (state in the URL: ?view=calendar|list, default list) ·
//                  ⋮ (Filters → #/calendar/filters · Export CSV)
//   SubBar (48)  : search input — server-side matching over name, sourceLabel
//                  (program / on demand / custom) and exercise names via
//                  workoutsApi.list({ search })
//   ScrollBody   : ?dayId= → 40px "Filtered: {day}" chip row with ✕ (clears
//                  the param; the day screen's History action deep-links here)
//                  list view   → month separators (32px) + flat 56px rows
//                  (date-desc, multi-session days stack):
//                     L1  THU 26 · name (bold, ellipsis) · difficulty pill
//                     L2  sourceLabel (muted) · "{h}h {m} min {s} sec"
//                         (formatDurationParts — zero units dropped)
//                  calendar view → LogCalendar (local §8 month grid: 40px
//                  cells, accent dots on trained days, day tap → that day's
//                  sessions → #/logs/{id})
//
//   Delete: long-press (450ms, pointer events; scroll/move cancels) opens the
//   destructive-confirm AlertDialog → workoutsApi.remove (§6.9 USER_DELETE
//   semantics) → sonner toast with Undo → workoutLifecycleApi.restore. The
//   same delete lives on the detail screen's ⋮ menu for keyboard users.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays,
  Dumbbell,
  FileDown,
  List,
  Loader2,
  MoreVertical,
  RotateCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { accountApi, dayApi, workoutLifecycleApi, workoutsApi } from "@/lib/client/api";
import { dayKeyOf, formatDayLabel, formatDurationParts, todayKey } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import { rowBase } from "@/lib/ui/tokens";
import { monthLabelLong, monthOf } from "@/features/calendar/month-utils";
import { errorMessage } from "@/features/routines/screen-helpers";
import { hapticWarning } from "@/lib/client/haptics";
import { cn } from "@/lib/utils";
import { LogCalendar } from "./log-calendar";
import { dayBadge, logRowName } from "./log-shared";
import type { WorkoutSummaryDTO } from "@/lib/types";

// ---------- pure helpers ----------

type MonthGroup = { key: string; label: string; workouts: WorkoutSummaryDTO[] };

function groupByMonth(workouts: WorkoutSummaryDTO[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();
  for (const w of workouts) {
    const anchor = monthOf(dayKeyOf(w.date));
    const key = `${anchor.year}-${String(anchor.month + 1).padStart(2, "0")}`;
    let g = index.get(key);
    if (!g) {
      g = { key, label: monthLabelLong(anchor), workouts: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.workouts.push(w);
  }
  return groups;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ---------- log row (56px, two stacked single lines) ----------

const LONG_PRESS_MS = 450;
/** Pointer travel (px) beyond which a press is treated as a scroll, not a hold. */
const PRESS_SLOP = 8;

function LogRow({
  summary,
  onDelete,
}: {
  summary: WorkoutSummaryDTO;
  onDelete: (w: WorkoutSummaryDTO) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const dayKey = dayKeyOf(summary.date);
  const name = logRowName(summary);
  const difficulty = summary.difficulty?.trim() || null;

  // long-press machinery (refs — no re-renders during the hold)
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);

  const clearPress = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  };
  useEffect(() => clearPress, []); // unmount safety

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longFired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    clearPress();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      longFired.current = true;
      hapticWarning();
      onDelete(summary);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (timer.current == null || origin.current == null) return;
    if (Math.abs(e.clientX - origin.current.x) > PRESS_SLOP || Math.abs(e.clientY - origin.current.y) > PRESS_SLOP) {
      clearPress();
    }
  };

  const open = () => navigate(`/logs/${summary.id}`);

  return (
    <article
      role="button"
      tabIndex={0}
      data-row
      {...tourAttrs({ id: "logs.day", label: "Session row", help: "Open a logged session; press and hold to delete it.", order: 50 })}
      aria-label={`Open ${name} session of ${formatDayLabel(dayKey)}`}
      className="flex h-14 w-full cursor-pointer select-none flex-col justify-center gap-0.5 overflow-hidden rounded-lg border bg-card whitespace-nowrap transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => {
        if (longFired.current) {
          longFired.current = false; // the hold already opened the delete dialog
          return;
        }
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
    >
      {/* L1 — THU 26 · name ..... difficulty pill */}
      <div className="flex min-w-0 w-full items-center gap-2 px-3">
        <span className="flex-none text-[11px] font-bold tracking-wide tabular-nums leading-none text-muted-foreground">
          {dayBadge(dayKey)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none">{name}</span>
        {difficulty ? (
          <span
            aria-label={`Difficulty ${difficulty.toLowerCase()}`}
            className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/10 px-2 text-[10px] font-bold uppercase leading-none text-primary"
          >
            {difficulty}
          </span>
        ) : null}
      </div>
      {/* L2 — sourceLabel ..... duration (zero units dropped) */}
      <div className="flex min-w-0 w-full items-center gap-2 px-3">
        <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted-foreground">
          {summary.sourceLabel ?? "Custom"}
        </span>
        <span className="flex-none text-[11px] tabular-nums leading-none text-muted-foreground">
          {formatDurationParts(summary.durationSec)}
        </span>
      </div>
    </article>
  );
}

// ---------- ?dayId= filter chip (40px row, ✕ clears the param) ----------

function DayFilterChip({ dayName, onClear }: { dayName: string; onClear: () => void }) {
  return (
    <div
      data-row
      className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden rounded-lg border border-primary/40 bg-primary/5 px-3 whitespace-nowrap"
    >
      <span className="flex-none text-[10px] font-bold uppercase tracking-wider text-primary">Filtered</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{dayName}</span>
      <button
        type="button"
        {...tourAttrs({ id: "logs.filteredChip", label: "Clear filter", help: "Show all sessions again by leaving the day filter.", order: 40 })}
        aria-label="Clear the day filter"
        onClick={onClear}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

// ---------- screen ----------

export default function LogsScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const route = useHashRoute();

  // ---------- URL state (?view= · ?dayId= — both deep-linkable) ----------
  const view: "list" | "calendar" =
    route.name === "logs" && route.query.get("view") === "calendar" ? "calendar" : "list";
  const dayId = route.name === "logs" ? (route.query.get("dayId")?.trim() || null) : null;

  const setView = (next: "list" | "calendar") => {
    const params = new URLSearchParams();
    if (next === "calendar") params.set("view", "calendar");
    if (dayId) params.set("dayId", dayId);
    const qs = params.toString();
    navigate(qs ? `/logs?${qs}` : "/logs");
  };
  const clearDayFilter = () => navigate(view === "calendar" ? "/logs?view=calendar" : "/logs");

  // search (SubBar) — debounced into the list query key
  const [searchInput, setSearchInput] = useState("");
  const debounced = useDebounced(searchInput, 250);
  const search = debounced.trim();

  const listParams = useMemo(
    () => ({ ...(search ? { search } : {}), ...(dayId ? { dayId } : {}) }),
    [search, dayId],
  );
  const listQuery = useQuery({
    queryKey: qk.workoutList(listParams),
    queryFn: () => workoutsApi.list(listParams),
    // keep the previous list on screen while a new search resolves
    placeholderData: (prev) => prev,
  });
  const workouts = useMemo(() => listQuery.data?.workouts ?? [], [listQuery.data]);
  const monthGroups = useMemo(() => groupByMonth(workouts), [workouts]);

  // day name for the ?dayId= chip (falls back to the logs' own identity)
  const dayQuery = useQuery({
    queryKey: qk.day(dayId ?? ""),
    queryFn: () => dayApi.get(dayId!),
    enabled: !!dayId,
    staleTime: 30_000,
    retry: false,
  });
  const filteredDayName = dayQuery.data?.name ?? (workouts.length > 0 ? logRowName(workouts[0]) : "this day");

  // delete flow (long-press → destructive confirm → remove + Undo toast)
  const [deleteTarget, setDeleteTarget] = useState<WorkoutSummaryDTO | null>(null);
  const confirmDelete = async (target: WorkoutSummaryDTO) => {
    const dayKey = dayKeyOf(target.date);
    try {
      await workoutsApi.remove(target.id);
      invalidate.workout(dayKey);
      toast.success("Session deleted", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              try {
                await workoutLifecycleApi.restore(target.id);
                invalidate.workout(dayKey);
                toast.success("Session restored");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            })(),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // CSV export — same download pattern as Settings → Data
  const [csvBusy, setCsvBusy] = useState(false);
  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const blob = await accountApi.exportCsv("workouts");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `setforge-workouts-${todayKey()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success("Workouts CSV downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setCsvBusy(false);
    }
  };

  const retry = () => void listQuery.refetch();
  const weekStart = settings?.weekStart === 0 ? 0 : 1;

  const emptyBody = dayId ? (
    <>
      <p className="text-sm font-semibold">No sessions of this day yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Every workout logged from this day lands here (currently filtered).
      </p>
    </>
  ) : search ? (
    <>
      <p className="text-sm font-semibold">{`No sessions match “${search}”`}</p>
      <p className="mt-1 text-sm text-muted-foreground">Try an exercise, program or source name.</p>
    </>
  ) : (
    <>
      <p className="text-sm font-semibold">No sessions yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Your logged workouts appear here.</p>
    </>
  );

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          title="Logs"
          actions={
            <>
              {view === "calendar" ? (
                <button
                  type="button"
                  {...tourAttrs({ id: "logs.toggleList", label: "List view", help: "Switch back to the month-by-month session list.", order: 10 })}
                  aria-label="Switch to list view"
                  onClick={() => setView("list")}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <List className="h-5 w-5" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  {...tourAttrs({ id: "logs.toggleCalendar", label: "Calendar view", help: "Switch to a month grid with dots on days you trained.", order: 10 })}
                  aria-label="Switch to calendar view"
                  onClick={() => setView("calendar")}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <CalendarDays className="h-5 w-5" aria-hidden />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="More actions"
                    tour={{ id: "logs.menu", label: "Menu", help: "Open filters or export your workouts as CSV.", order: 20 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/calendar/filters")}>
                    <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={csvBusy || !online} onClick={() => void exportCsv()}>
                    {csvBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <FileDown className="h-4 w-4" aria-hidden />
                    )}
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              placeholder="Search…"
              aria-label="Search workout logs"
              {...tourAttrs({ id: "logs.search", label: "Search", help: "Find sessions by exercise, program or source name.", order: 30 })}
              className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        </SubBar>
      }
    >
      <ScrollBody>
        {listQuery.isLoading ? (
          view === "calendar" ? (
            <LogCalendar
              workouts={[]}
              emphasisedDayId={dayId}
              weekStart={weekStart}
              loading
              onOpenLog={(id) => navigate(`/logs/${id}`)}
            />
          ) : (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading workout logs">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="h-8 w-40 rounded-lg" />
                  {[0, 1].map((j) => (
                    <Skeleton key={j} className="h-14 rounded-lg" />
                  ))}
                </div>
              ))}
            </div>
          )
        ) : listQuery.error ? (
          <div
            data-row
            role="alert"
            className={`${rowBase} my-2 gap-2 rounded-lg border border-destructive/40 bg-card px-4 text-sm text-destructive`}
          >
            <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{errorMessage(listQuery.error)}</span>
            <button
              type="button"
              {...tourAttrs({ id: "logs.retry", label: "Retry", help: "Reload your workout logs.", order: 60 })}
              aria-label="Try again"
              onClick={retry}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : workouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
            <Dumbbell className="mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden />
            {emptyBody}
          </div>
        ) : view === "calendar" ? (
          <div className="flex flex-col gap-4">
            {dayId ? <DayFilterChip dayName={filteredDayName} onClear={clearDayFilter} /> : null}
            <LogCalendar
              workouts={workouts}
              emphasisedDayId={dayId}
              weekStart={weekStart}
              loading={false}
              onOpenLog={(id) => navigate(`/logs/${id}`)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {dayId ? <DayFilterChip dayName={filteredDayName} onClear={clearDayFilter} /> : null}
            {monthGroups.map((g) => (
              <section key={g.key} className="flex flex-col gap-3" aria-label={g.label}>
                {/* month separator — 32px, not a data-row */}
                <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex-none truncate">{g.label}</span>
                  <span className="flex-none tabular-nums">· {g.workouts.length}</span>
                  <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
                </h2>
                {g.workouts.map((w) => (
                  <LogRow key={w.id} summary={w} onDelete={setDeleteTarget} />
                ))}
              </section>
            ))}
          </div>
        )}
      </ScrollBody>

      {/* destructive confirm — long-press delete (§6.9 remove semantics) */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${logRowName(deleteTarget)} on ${formatDayLabel(dayKeyOf(deleteTarget.date))} (${formatDurationParts(deleteTarget.durationSec)}) will be removed from your logs. You can undo for a few seconds.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target) void confirmDelete(target);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
