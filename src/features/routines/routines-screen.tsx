"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramsScreen — #/programs (Part 5 rebuild of the routines LIST).
//
//   TopBar (56)  : "Programs" · `+` DropdownMenu → New routine · New session ·
//                  Session from today's workout (only when today's workout has
//                  ≥1 exercise — inline name Dialog prefilled "Session · d MMM")
//   SubBar (48)  : Tabs `Routines | Sessions` (controlled; ?tab= deep link)
//   ScrollBody   : ROUTINES — 72px RoutineRows:
//                  [name (+ "Day i/n · " prefix when followed) / meta line] |
//                  Follow button 88px (outlined "Follow" / filled "Following ✓",
//                  disabled+tooltip when no workout days) | ⋮ 44px (Edit ·
//                  Schedule… · Copy · Delete confirm)
//                  SESSIONS — 72px SessionRows: same layout, Start button 72px
//                  (start-day, no dayId → #/today). Desktop (≥lg): 2-col grid.
//
// Following another routine → destructive confirm "Unfollow X and start Y
// from Day 1?". All mutations go through the offline-aware runners and
// invalidate programs/dashboard/schedule queries.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarClock, Check, Copy, Dumbbell, Layers, MoreVertical, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { routinesApi, programsApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline, usePrograms, useWorkoutByDate } from "@/lib/client/query";
import type { ProgramSummaryDTO } from "@/lib/types";
import { todayKey } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import { DatePickerDialog } from "@/features/schedule/schedule-shared";
import { InlineInput, errorMessage, usedAgoFromDayKey, useProgramRun, useRoutineRun } from "./screen-helpers";
import { useSessionFromWorkout } from "./session-dialog";

type Tab = "routines" | "sessions";

const ROW_CLS =
  "flex h-18 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-2 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default function RoutinesScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const { run: programRun } = useProgramRun();
  const sessionFromWorkout = useSessionFromWorkout();

  // ---------- tab state (?tab= deep link from Home's "Log another session") ----------
  const tabParam = route.name === "programs" ? route.query.get("tab") : null;
  const [tab, setTab] = useState<Tab>(tabParam === "sessions" ? "sessions" : "routines");
  // adjust tab during render when the deep-link param changes (no effect → no cascading renders)
  const [prevParam, setPrevParam] = useState(tabParam);
  if (tabParam !== prevParam) {
    setPrevParam(tabParam);
    setTab(tabParam === "sessions" ? "sessions" : "routines");
  }

  // ---------- data ----------
  const kind = tab === "sessions" ? "SESSION" : "ROUTINE";
  const programsQuery = usePrograms(kind);
  const programs = useMemo(
    () => [...(programsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [programsQuery.data],
  );

  // full routine payloads (session set-count join + current follow fallback)
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const setCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of routinesQuery.data?.routines ?? []) {
      m.set(
        r.id,
        r.days.reduce((n, d) => n + d.exercises.reduce((m2, re) => m2 + re.sets.length, 0), 0),
      );
    }
    return m;
  }, [routinesQuery.data]);

  const dashboard = useDashboard();
  const followed = dashboard.data?.active ?? null;

  const todayDateKey = dashboard.data?.today.date ?? todayKey();
  const todayWorkoutQuery = useWorkoutByDate(todayDateKey);
  const todayWorkout = todayWorkoutQuery.data?.workout ?? null;

  // ---------- ui state ----------
  const [creating, setCreating] = useState<"ROUTINE" | "SESSION" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramSummaryDTO | null>(null);
  const [followTarget, setFollowTarget] = useState<ProgramSummaryDTO | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ProgramSummaryDTO | null>(null);

  // ---------- mutations ----------
  const createProgram = async (name: string, programKind: "ROUTINE" | "SESSION") => {
    if (!name) return;
    const ok = await run(() => routinesApi.create({ name, kind: programKind }), {
      path: "/api/routines",
      method: "POST",
      body: { name, kind: programKind },
      label: `Created ${name}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(
        programKind === "SESSION" ? `Session “${name}” created` : `Routine “${name}” created`,
      );
    }
  };

  const copyProgram = async (program: ProgramSummaryDTO) => {
    const ok = await run(() => routinesApi.copy(program.id), {
      path: `/api/routines/${program.id}/copy`,
      method: "POST",
      label: "Duplicate program",
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Duplicated “${program.name}”`);
    }
  };

  const deleteProgram = async (program: ProgramSummaryDTO) => {
    const ok = await run(() => routinesApi.remove(program.id), {
      path: `/api/routines/${program.id}`,
      method: "DELETE",
      label: `Deleted ${program.name}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Deleted “${program.name}”`);
    }
  };

  const followProgram = async (program: ProgramSummaryDTO) => {
    const res = await programRun(
      () => programsApi.follow(program.id),
      {
        path: `/api/programs/${program.id}/follow`,
        method: "POST",
        body: {},
        label: `Following ${program.name}`,
      },
    );
    if (res) toast.success(`Following ${program.name} · Day ${res.dayIndex + 1}`);
  };

  const onFollowClick = (program: ProgramSummaryDTO) => {
    if (followed && followed.routineId !== program.id) {
      setFollowTarget(program); // destructive: replaces the current follow
      return;
    }
    void followProgram(program);
  };

  const startSession = async (program: ProgramSummaryDTO) => {
    if (!online) {
      toast.info("Starting a session needs a connection");
      return;
    }
    try {
      await programsApi.startDay(program.id);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${program.name}`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- rows ----------
  const renderOverflowMenu = (program: ProgramSummaryDTO) => (
    <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 p-0"
            aria-label={`Actions for ${program.name}`}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => navigate(`/programs/${program.id}`)}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setScheduleTarget(program)}>
            <CalendarClock className="h-4 w-4" aria-hidden />
            Schedule…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyProgram(program)}>
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(program)}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );

  const renderRoutineRow = (program: ProgramSummaryDTO) => {
    const isFollowed = !!program.isFollowed;
    const hasWorkoutDay = program.dayCount - program.restCount > 0;
    const cursor = program.cursor ?? null;
    const namePrefix = isFollowed && cursor ? `Day ${cursor.dayIndex + 1}/${cursor.dayCount} · ` : "";
    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${program.dayCount} days, ${program.exerciseCount} exercises, ${usedAgoFromDayKey(program.lastUsedAt)}`}
        className={ROW_CLS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(`/programs/${program.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/programs/${program.id}`);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-semibold leading-none">
            {namePrefix}
            {program.name}
          </span>
          <span className="truncate text-xs leading-none text-muted-foreground">
            {program.dayCount} {program.dayCount === 1 ? "day" : "days"} · {program.restCount} rest ·{" "}
            {program.exerciseCount} {program.exerciseCount === 1 ? "exercise" : "exercises"} ·{" "}
            {usedAgoFromDayKey(program.lastUsedAt)}
          </span>
        </div>
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          {hasWorkoutDay ? (
            <Button
              type="button"
              variant={isFollowed ? "default" : "outline"}
              className="h-11 w-[88px] flex-none gap-1 whitespace-nowrap px-2 text-xs font-bold"
              aria-pressed={isFollowed}
              aria-label={isFollowed ? `Following ${program.name}` : `Follow ${program.name}`}
              onClick={() => onFollowClick(program)}
            >
              {isFollowed ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Following
                </>
              ) : (
                "Follow"
              )}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-11 w-[88px] flex-none whitespace-nowrap px-2 text-xs font-bold"
                  aria-label="Follow disabled — needs a workout day"
                >
                  Follow
                </Button>
              </TooltipTrigger>
              <TooltipContent>Needs at least one workout day</TooltipContent>
            </Tooltip>
          )}
        </span>
        {renderOverflowMenu(program)}
      </div>
    );
  };

  const renderSessionRow = (program: ProgramSummaryDTO) => {
    const sets = setCountById.get(program.id) ?? 0;
    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${program.exerciseCount} exercises, ${usedAgoFromDayKey(program.lastUsedAt)}`}
        className={ROW_CLS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(`/programs/${program.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/programs/${program.id}`);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-semibold leading-none">{program.name}</span>
          <span className="truncate text-xs leading-none text-muted-foreground">
            {program.exerciseCount} {program.exerciseCount === 1 ? "exercise" : "exercises"} · {sets}{" "}
            {sets === 1 ? "set" : "sets"} · {usedAgoFromDayKey(program.lastUsedAt)}
          </span>
        </div>
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            className="h-11 w-[72px] flex-none gap-1 whitespace-nowrap px-2 text-xs font-bold"
            aria-label={`Start session ${program.name}`}
            onClick={() => void startSession(program)}
          >
            <Play className="h-4 w-4" aria-hidden />
            Start
          </Button>
        </span>
        {renderOverflowMenu(program)}
      </div>
    );
  };

  const canSessionFromWorkout = (todayWorkout?.exercises.length ?? 0) > 0;
  const empty = !programsQuery.isLoading && programs.length === 0;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="Programs"
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-none"
                  aria-label="New program"
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setCreating("ROUTINE")}>
                  <Layers className="h-4 w-4" aria-hidden /> New routine
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreating("SESSION")}>
                  <Play className="h-4 w-4" aria-hidden /> New session
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canSessionFromWorkout}
                  onClick={() => {
                    if (todayWorkout) sessionFromWorkout.openFor(todayWorkout.id, todayDateKey);
                  }}
                >
                  <Dumbbell className="h-4 w-4" aria-hidden /> Session from today&apos;s workout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
      subBar={
        <SubBar>
          <div role="tablist" aria-label="Program kind" className="flex h-11 w-full items-center gap-2">
            {(["routines", "sessions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-lg border text-sm font-bold capitalize transition-colors",
                  tab === t
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/40",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </SubBar>
      }
    >
      <ScrollBody contentClassName="lg:grid lg:grid-cols-2 lg:gap-3">
        {creating ? (
          <div
            data-row
            className="flex h-18 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-2 pr-1 lg:col-span-2"
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center text-muted-foreground/60">
              {creating === "SESSION" ? (
                <Play className="h-4 w-4" aria-hidden />
              ) : (
                <Layers className="h-4 w-4" aria-hidden />
              )}
            </span>
            <InlineInput
              value=""
              placeholder={creating === "SESSION" ? "New session name…" : "New routine name…"}
              ariaLabel={creating === "SESSION" ? "New session name" : "New routine name"}
              onCommit={(name) => {
                const kind2 = creating;
                setCreating(null);
                void createProgram(name, kind2);
              }}
              onCancel={() => setCreating(null)}
              className="h-11 min-w-0 flex-1"
            />
          </div>
        ) : null}

        {programsQuery.isLoading ? (
          <div className="flex flex-col gap-3 lg:col-span-2" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border lg:col-span-2">
            {tab === "sessions" ? (
              <Play className="h-6 w-6 text-muted-foreground" aria-hidden />
            ) : (
              <Layers className="h-6 w-6 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-semibold">
              {tab === "sessions" ? "No sessions yet" : "Create your first routine"}
            </p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              {tab === "sessions"
                ? "Save a finished workout as a session to reuse it in one tap."
                : "Split your training into days, then follow the program from Home."}
            </p>
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => setCreating(tab === "sessions" ? "SESSION" : "ROUTINE")}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {tab === "sessions" ? "New session" : "New routine"}
            </Button>
          </div>
        ) : (
          programs.map((program) =>
            tab === "sessions" ? renderSessionRow(program) : renderRoutineRow(program),
          )
        )}

        {/* destructive confirm: program delete */}
        <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {tab === "sessions" ? "session" : "routine"}?</AlertDialogTitle>
              <AlertDialogDescription>
                “{deleteTarget?.name}” and its {deleteTarget?.dayCount ?? 0} day
                {(deleteTarget?.dayCount ?? 0) === 1 ? "" : "s"} will be removed. Logged workouts stay
                untouched. This cannot be undone.
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
                  if (target) void deleteProgram(target);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* destructive confirm: replace the followed routine */}
        <AlertDialog open={followTarget != null} onOpenChange={(o) => !o && setFollowTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Unfollow {followed?.routineName ?? "your program"} and start {followTarget?.name} from
                Day 1?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Only one program can drive your Home dashboard and day rollover at a time. Your logged
                workouts are never touched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  const target = followTarget;
                  setFollowTarget(null);
                  if (target) void followProgram(target);
                }}
              >
                Start from Day 1
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* date picker → schedule picker for the chosen program */}
        <DatePickerDialog
          open={scheduleTarget != null}
          onOpenChange={(o) => !o && setScheduleTarget(null)}
          initialKey={todayDateKey}
          title={`Schedule ${scheduleTarget?.name ?? ""}`}
          description="Pick the date — then choose the day to schedule."
          onSelect={(dayKey) => {
            setScheduleTarget(null);
            navigate(`/schedule/pick?date=${dayKey}`);
          }}
        />

        {sessionFromWorkout.dialog}
      </ScrollBody>
    </Screen>
  );
}
