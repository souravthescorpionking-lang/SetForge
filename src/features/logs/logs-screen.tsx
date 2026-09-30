"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogsScreen — #/logs (Part 8 §3.4 Workout Logs).
//
//   TopBar (56)  : BackButton(→ #/workout) · "Workout Logs" · 📅 (→ #/calendar)
//                  · ⋮ (Filters → #/calendar/filters · Export CSV → the same
//                  accountApi.exportCsv("workouts") download Settings uses)
//   SubBar (48)  : search input ("Search…") — server-side matching over
//                  exercise names, notes (comment) and labels (category names)
//                  via workoutsApi.list({ search })
//   ScrollBody   : month separators (32px, "September 2026") → one day card per
//                  LOGGED session (several per day possible; list is date-desc):
//
//     |▌ THU 26            Push day · PPL | 48px  day-of-week + date (bold) ·
//     |  12 sets · 3,400 kg · 48 min      | 40px  name/note right, stats below
//
//   Day card: border rounded-lg + 4px colour bar. DATA NOTE (documented gap in
//   the worklog): WorkoutSummaryDTO carries no sourceType/sourceRoutine name,
//   so the bar cannot be source-coloured (Program/On Demand/Freestyle) without
//   a server DTO change; it uses the session's primary CATEGORY colour (the
//   same Law-7 signal singleton GroupCards use), falling back to neutral muted
//   for sessions without categories. Row 1's right label likewise degrades to
//   the session note → category names ("Chest · Shoulders · Triceps").
//
//   Delete: long-press (450ms, pointer events; scroll/move cancels) opens the
//   destructive-confirm AlertDialog → workoutsApi.remove (§6.9 USER_DELETE
//   remove semantics) → sonner toast with Undo → workoutLifecycleApi.restore.
//   The same delete also lives on the detail screen's ⋮ menu, so keyboard
//   users always have a path.
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
  Loader2,
  MoreVertical,
  RotateCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { accountApi, workoutLifecycleApi, workoutsApi } from "@/lib/client/api";
import { dayKeyOf, formatDayLabel, parseDayKey, round2, todayKey } from "@/lib/client/format";
import { rowBase, rowTall } from "@/lib/ui/tokens";
import { monthLabelLong, monthOf } from "@/features/calendar/month-utils";
import { errorMessage } from "@/features/routines/screen-helpers";
import { hapticWarning } from "@/lib/client/haptics";
import { cn } from "@/lib/utils";
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

/** "THU 26" — day-of-week + date for the card's first row. */
function dayBadge(dayKey: string): string {
  const d = parseDayKey(dayKey);
  const dow = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).toUpperCase();
  return `${dow} ${d.getUTCDate()}`;
}

/** Seconds → "45 s" / "48 min" (the spec's list row format). */
function formatMinutes(sec: number): string {
  if (sec < 60) return `${sec} s`;
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

/** Row 2: "12 sets · 3,400 kg · 48 min" (distance replaces volume on cardio days). */
function statsLine(w: WorkoutSummaryDTO): string {
  const parts: string[] = [`${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`];
  if (w.volume > 0) parts.push(`${Math.round(w.volume).toLocaleString()} kg`);
  else if (w.distance > 0) parts.push(`${round2(w.distance)} km`);
  if (w.durationSec > 0) parts.push(formatMinutes(w.durationSec));
  return parts.join(" · ");
}

/**
 * Row 1 right label. The spec wants "session/day name · program name" — that
 * provenance is not in WorkoutSummaryDTO (worklog gap), so the best available
 * label is the session note, else its category names.
 */
function cardLabel(w: WorkoutSummaryDTO): string | null {
  const comment = w.comment?.trim();
  if (comment) return comment;
  if (w.categories.length > 0) return w.categories.slice(0, 3).map((c) => c.name).join(" · ");
  return null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ---------- day card ----------

const LONG_PRESS_MS = 450;
/** Pointer travel (px) beyond which a press is treated as a scroll, not a hold. */
const PRESS_SLOP = 8;

function DayCard({
  summary,
  onDelete,
}: {
  summary: WorkoutSummaryDTO;
  onDelete: (w: WorkoutSummaryDTO) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const dayKey = dayKeyOf(summary.date);
  const label = cardLabel(summary);
  const barColour = summary.categories[0]?.colour;

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
      {...tourAttrs({ id: "logs.day", label: "Session card", help: "Open a logged session; press and hold to delete it.", order: 40 })}
      aria-label={`Open session of ${formatDayLabel(dayKey)}`}
      className="flex cursor-pointer select-none overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      {/* 4px colour bar — primary category colour (muted when categoriless) */}
      <div aria-hidden className={cn("w-1 flex-none", !barColour && "bg-muted")} style={barColour ? { backgroundColor: barColour } : undefined} />
      <div className="min-w-0 flex-1">
        {/* row 1 — 48px: THU 26 · label */}
        <div data-row className={`${rowTall} gap-3 px-3`}>
          <span className="flex-none text-sm font-bold tracking-wide tabular-nums">{dayBadge(dayKey)}</span>
          {label ? (
            <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">{label}</span>
          ) : (
            <span className="ml-auto h-px min-w-0 flex-1 bg-border/60" aria-hidden />
          )}
        </div>
        {/* row 2 — 40px: sets · volume · duration */}
        <div data-row className={`${rowBase} px-3`}>
          <span className="min-w-0 flex-1 truncate text-sm tabular-nums text-muted-foreground">{statsLine(summary)}</span>
        </div>
      </div>
    </article>
  );
}

// ---------- screen ----------

export default function LogsScreen() {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();

  // search (SubBar) — debounced into the list query key
  const [searchInput, setSearchInput] = useState("");
  const debounced = useDebounced(searchInput, 250);
  const search = debounced.trim();

  const listQuery = useQuery({
    queryKey: qk.workoutList(search ? { search } : {}),
    queryFn: () => workoutsApi.list(search ? { search } : undefined),
    // keep the previous list on screen while a new search resolves
    placeholderData: (prev) => prev,
  });
  const workouts = useMemo(() => listQuery.data?.workouts ?? [], [listQuery.data]);
  const monthGroups = useMemo(() => groupByMonth(workouts), [workouts]);

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

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          title="Workout Logs"
          actions={
            <>
              <button
                type="button"
                {...tourAttrs({ id: "logs.calendar", label: "Calendar", help: "Open the month calendar and schedule.", order: 10 })}
                aria-label="Calendar"
                onClick={() => navigate("/calendar")}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
              </button>
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
              {...tourAttrs({ id: "logs.search", label: "Search", help: "Find sessions by exercise, note or label.", order: 30 })}
              className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        </SubBar>
      }
    >
      <ScrollBody>
        {listQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading workout logs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="h-8 w-40 rounded-lg" />
                {[0, 1].map((j) => (
                  <Skeleton key={j} className="h-[88px] rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        ) : listQuery.error ? (
          <div
            data-row
            role="alert"
            className={`${rowTall} gap-2 rounded-lg border border-destructive/40 bg-card px-4 text-sm text-destructive`}
          >
            <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{errorMessage(listQuery.error)}</span>
            <button
              type="button"
              {...tourAttrs({ id: "logs.retry", label: "Retry", help: "Reload your workout logs.", order: 50 })}
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
            <p className="text-sm font-semibold">{search ? `No sessions match “${search}”` : "No sessions yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? "Try an exercise name, note or label." : "Your logged workouts appear here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {monthGroups.map((g) => (
              <section key={g.key} className="flex flex-col gap-3" aria-label={g.label}>
                {/* month separator — 32px, not a data-row */}
                <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex-none truncate">{g.label}</span>
                  <span className="flex-none tabular-nums">· {g.workouts.length}</span>
                  <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
                </h2>
                {g.workouts.map((w) => (
                  <DayCard key={w.id} summary={w} onDelete={setDeleteTarget} />
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
                ? `The session on ${formatDayLabel(dayKeyOf(deleteTarget.date))} (${statsLine(deleteTarget)}) will be removed from your logs. You can undo for a few seconds.`
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
