"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — #/programs/{id} (Part 8 §3.5 — VIEW-ONLY program detail).
//
//   TopBar (56)  : BackButton → #/programs · program name · ⋮ (Edit in Builder
//                  → #/builder/program/{id} · Schedule day · Skip day · Jump to
//                  day · Unfollow · Copy · Delete) · TopBarHelp
//   SubBar (48)  : `Intermediate · 6 days · ~50 min` (difficulty · daysPerWeek
//                  or day count · estMinutes — RoutineDTO meta)
//   ScrollBody   : Following row 48 (only when active):
//                  `Day {n+1}/{total} · {dayName}`.
//                  Day accordion rows 56 (ONE open at a time — mobile pattern;
//                  the cursor day opens by default): chevron · `Day {n} {name}`
//                  · right status chip — ✓ completedDayIds / "Today" cursor ·
//                  ⋮. Day-header long-press (500ms hold or right-click) opens
//                  the same day menu (Schedule · Favourite · Mark off · History).
//                  Expanded body: GroupCards in VIEW mode (Reps/Tempo/⏱ rows)
//                  via deriveGroups + toCardExercise + toCardSet + memberCode,
//                  wrapped in GroupCardStack (16px gap + divider between groups).
//   BottomBar(56): following → `Start Day {n}` (start-day flow → #/session; a
//                  REST cursor day offers `Train anyway` → #/on-demand) ·
//                  not following → `Follow` (replace-confirm when another
//                  program is active).
//
// Stripped vs Part 5/6 (editing is the Builder's job now): whole-screen edit
// mode, inline renames, notes editor, labels editor, phase filter, drag
// glyphs, add day / add exercise, ProgramHeaderBlock/TotalsRow overview. Kept:
// the ⋮ machinery, cursor jump list (?jump=1 deep link), day scheduling with
// conflict handling, mark off/unmark with Undo toasts, exercise notes popover,
// destructive confirms.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Dumbbell,
  Hammer,
  History,
  Loader2,
  Moon,
  MoreVertical,
  Play,
  SkipForward,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { programsApi, programsMetaApi, routinesApi, scheduleApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline } from "@/lib/client/query";
import { useHashRoute } from "@/features/shell/router";
import { formatDayLabel, todayKey, addDaysKey } from "@/lib/client/format";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { GroupCard, GroupCardStack, toCardSet } from "@/components/group-card";
import type { CardAction, CardVisibleColumns } from "@/components/group-card";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";
import { errorMessage, toCardExercise, useProgramRun, useRoutineRun } from "./screen-helpers";
import { programExtraKeys, useProgramExtras, unmarkDayOffFull } from "./program-meta";
import { programMetaLine } from "./routines-screen";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// DaySection — one accordion section: header + 0fr→1fr animated body.
// The grid-TEMPLATE-ROWS animates (never height): opening reveals the mounted
// body smoothly; closing unmounts it instantly, so a collapsed section owns
// zero [data-row] elements (harness-safe) and nothing can ever overlap.
// ─────────────────────────────────────────────────────────────────────────────

function DaySection({ open, header, children }: { open: boolean; header: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card">
      {header}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? children : null}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseNotesPopover — read-only exercise notes (anchored popover).
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseNotesPopover({
  exerciseName,
  notes,
  open,
  onClose,
}: {
  exerciseName: string;
  notes: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className="absolute bottom-2 left-2 h-1 w-1" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The ⋮ menu closes by returning focus to its trigger; without this
        // the popover would be instantly dismissed (same Radix gotcha as the
        // Today card popovers). Pointer-outside + Escape still close.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {exerciseName} — notes
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {notes && notes.trim().length > 0 ? notes : "No notes on this exercise."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Long-press starts on the row itself, never on an inner interactive control. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("button, a, input, [role='menuitem']");
}

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — keyed by routineId so every local UI state (open day,
// day menu, collapses, completion deltas) resets naturally on navigation.
// ─────────────────────────────────────────────────────────────────────────────

export default function RoutineDetailScreen({ routineId }: { routineId: string }) {
  return <RoutineDetailInner key={routineId} routineId={routineId} />;
}

function RoutineDetailInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useRoutineRun();
  const { run: programRun } = useProgramRun();
  const route = useHashRoute();
  const scheduleCreate = useScheduleCreate();
  const invalidateExtras = useProgramExtras();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  // follow state — the dashboard carries the active program
  const { data: dashboardData } = useDashboard();
  const active = dashboardData?.active ?? null;
  const followed = active && active.routineId === routineId ? active : null;
  const isSession = (routine?.kind ?? "ROUTINE") === "SESSION";

  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );
  const hasWorkoutDay = days.some((d) => (d.dayType ?? "WORKOUT") !== "REST");

  // ---------- ui state ----------
  // undefined = follow the default (cursor day when following, else day 1).
  const [openDayId, setOpenDayId] = useState<string | undefined>(undefined);
  const [menuDayId, setMenuDayId] = useState<string | null>(null);
  const [notesReId, setNotesReId] = useState<string | null>(null);
  const [deleteRoutineOpen, setDeleteRoutineOpen] = useState(false);
  const [unfollowOpen, setUnfollowOpen] = useState(false);
  const [followReplaceOpen, setFollowReplaceOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState<RoutineDayDTO | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [completedDelta, setCompletedDelta] = useState<Map<string, boolean>>(new Map());
  const [jumpOpen, setJumpOpen] = useState(
    () => route.query.get("jump") === "1" && route.name === "program-detail",
  );

  // §3.5 day-header long-press: 500ms hold (or right-click) opens the day menu.
  const lpTimer = useRef<number | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cancelLongPress = () => {
    if (lpTimer.current != null) {
      window.clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
    lpStart.current = null;
  };
  const beginLongPress = (dayId: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target)) return; // inner buttons own their events
    suppressClick.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    cancelLongPress();
    lpTimer.current = window.setTimeout(() => {
      lpTimer.current = null;
      suppressClick.current = true; // the pointerup click must not toggle the accordion
      setMenuDayId(dayId);
    }, 500);
  };
  const longPressMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = lpStart.current;
    if (s && (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10)) cancelLongPress();
  };
  const openDayMenu = (dayId: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
    suppressClick.current = true;
    setMenuDayId(dayId);
  };

  // ---------- completed days (✓ chips) ----------
  // completed = activeRoutine.completedDayIds ∪ DONE schedule entries
  // (§4.5 fallback: unfollowed programs count only their DONE entries)
  const scheduleEntriesQuery = useQuery({
    queryKey: programExtraKeys.schedule(routineId),
    queryFn: () =>
      scheduleApi.list({ from: addDaysKey(todayKey(), -400), to: addDaysKey(todayKey(), 60) }),
  });

  const serverCompletedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of followed?.completedDayIds ?? []) s.add(id);
    for (const e of scheduleEntriesQuery.data?.entries ?? []) {
      if (e.routineId === routineId && e.status === "DONE" && e.dayId) s.add(e.dayId);
    }
    return s;
  }, [followed, scheduleEntriesQuery.data, routineId]);
  const completedIds = useMemo(() => {
    const s = new Set(serverCompletedIds);
    for (const [id, on] of completedDelta) {
      if (on) s.add(id);
      else s.delete(id);
    }
    return s;
  }, [serverCompletedIds, completedDelta]);
  const applyCompletedDelta = (dayId: string, completed: boolean) => {
    setCompletedDelta((prev) => {
      const next = new Map(prev);
      next.set(dayId, completed);
      return next;
    });
  };

  // ---------- accordion: ONE day open (phone-only mobile pattern) ----------
  const defaultOpenDayId = followed
    ? (days[followed.cursorDayIndex]?.id ?? days[0]?.id ?? "")
    : (days[0]?.id ?? "");
  const effectiveOpen = (dayId: string) => (openDayId ?? defaultOpenDayId) === dayId;
  const toggleDay = (dayId: string) => {
    const current = openDayId ?? defaultOpenDayId;
    setOpenDayId(current === dayId ? "" : dayId);
  };

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  /** ⋮ "Schedule day" target: the cursor day when following, else the first workout day. */
  const scheduleTargetDay = useMemo<RoutineDayDTO | null>(() => {
    if (followed) {
      const cur = days[followed.cursorDayIndex];
      if (cur && (cur.dayType ?? "WORKOUT") !== "REST") return cur;
    }
    return days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null;
  }, [days, followed]);

  // ---------- routine-level mutations ----------
  const copyRoutine = async () => {
    if (!routine) return;
    const ok = await run(() => routinesApi.copy(routineId), {
      path: `/api/routines/${routineId}/copy`,
      method: "POST",
      label: "Duplicate routine",
    });
    if (ok) toast.success(`Duplicated “${routine.name}”`);
  };

  const removeRoutine = async () => {
    const ok = await run(() => routinesApi.remove(routineId), {
      path: `/api/routines/${routineId}`,
      method: "DELETE",
      label: `Deleted ${routine?.name ?? "routine"}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Deleted “${routine?.name ?? "routine"}”`);
      navigate("/programs");
    }
  };

  const unfollowProgram = async () => {
    const res = await programRun(
      () => programsApi.unfollow(),
      { path: "/api/programs/follow", method: "DELETE", label: "Program unfollowed" },
    );
    if (res) {
      invalidateExtras(); // programs + dashboard + schedule + routines families
      toast.success(`Unfollowed ${routine?.name ?? "program"}`);
    }
  };

  const followProgram = async () => {
    const res = await programRun(
      () => programsApi.follow(routineId),
      {
        path: `/api/programs/${routineId}/follow`,
        method: "POST",
        body: {},
        label: `Following ${routine?.name ?? "program"}`,
      },
    );
    if (res) {
      invalidateExtras();
      toast.success(`Following ${routine?.name ?? "program"} · Day ${res.dayIndex + 1}`);
    }
  };

  const onFollowClick = () => {
    if (active && active.routineId !== routineId) {
      setFollowReplaceOpen(true); // destructive: replaces the current follow
      return;
    }
    void followProgram();
  };

  // ---------- cursor / day mutations ----------
  const jumpToDay = async (dayIndex: number) => {
    const res = await programRun(
      () => programsApi.jumpCursor(dayIndex),
      { path: "/api/programs/cursor/jump", method: "POST", body: { dayIndex }, label: "Cursor moved" },
    );
    if (res) toast.success(`Day ${res.dayIndex + 1} · ${res.day.name}`);
  };

  const skipCursorDay = async () => {
    const res = await programRun(
      () => programsApi.skipCursorDay(),
      { path: "/api/programs/cursor/skip", method: "POST", label: "Day skipped" },
    );
    if (res) toast.success(`Skipped ${res.skipped.name} · ${res.day.name} up next`);
  };

  // ---------- BottomBar: start-day flow (same as the Workout tab's card) ----------
  const startDay = async () => {
    if (!followed || startBusy) return;
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setStartBusy(true);
    try {
      const w = await programsApi.startDay(routineId, followed.dayId ? { dayId: followed.dayId } : {});
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${followed.dayName}`, {
        description: `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} loaded`,
      });
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStartBusy(false);
    }
  };

  const scheduleRoutineDay = (day: RoutineDayDTO, dateKey: string) => {
    if (!routine) return;
    void scheduleCreate.create({
      date: dateKey,
      routineId,
      dayId: day.id,
      toastLabel: `Scheduled ${routine.name} · ${day.name} for ${formatDayLabel(dateKey)}`,
    });
  };

  // ---------- day menu actions (⋮ + long-press) ----------
  const toggleDayFavourite = async (day: RoutineDayDTO) => {
    if (!online) {
      toast.info("Favourite days need a connection");
      return;
    }
    try {
      const res = await programsMetaApi.favouriteDay(routineId, day.id);
      invalidate.routines();
      invalidateExtras(routineId);
      toast.success(res.isFavorite ? `“${day.name}” favourited` : `“${day.name}” unfavourited`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const markDayDone = async (day: RoutineDayDTO, quiet = false) => {
    if (!online) {
      toast.info("Marking a day off needs a connection");
      return;
    }
    try {
      const res = await programsMetaApi.markOff(routineId, day.id);
      invalidateExtras(routineId);
      applyCompletedDelta(day.id, true);
      if (!quiet) {
        toast.success(`Day marked off${res.advanced ? " · program advanced" : ""}`, {
          action: { label: "Undo", onClick: () => void unmarkDayDone(day, true) },
        });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const unmarkDayDone = async (day: RoutineDayDTO, quiet = false) => {
    if (!online) {
      toast.info("Unmarking a day needs a connection");
      return;
    }
    try {
      await unmarkDayOffFull(routineId, day.id);
      invalidateExtras(routineId);
      applyCompletedDelta(day.id, false);
      if (!quiet) {
        toast.success(`“${day.name}” unmarked`, {
          action: { label: "Undo", onClick: () => void markDayDone(day, true) },
        });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- group cards (view mode) ----------
  const handleGroupAction =
    (members: RoutineExerciseDTO[]) =>
    (action: CardAction, entryIndex: number): void => {
      const re = members[entryIndex];
      switch (action.type) {
        case "detail":
        case "history":
        case "graph":
        case "records":
          // action.exerciseId carries the card entry id — navigate by the
          // underlying library exercise id instead.
          if (re) navigate(`/exercise-overview/${re.exerciseId}`);
          break;
        case "notes":
          if (re) setNotesReId(re.id);
          break;
        default:
          break; // view mode emits only the … nav + notes actions
      }
    };

  const renderDayBody = (day: RoutineDayDTO) => {
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    if (isRest) {
      return (
        <div
          data-row
          className="flex h-10 items-center overflow-hidden whitespace-nowrap px-3 text-sm text-muted-foreground"
        >
          Rest day — nothing to log
        </div>
      );
    }
    const exercises = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    if (exercises.length === 0) {
      return (
        <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No exercises in this day yet.
        </p>
      );
    }
    // §2.1 grouping: ungrouped exercises are their own group of 1; grouped
    // members get A1/A2 member codes, singletons show the bare group letter.
    const groups = deriveGroups(exercises);
    return (
      <div className="flex-none p-2">
        <GroupCardStack>
          {groups.map((g) => {
            const notesMember = g.members.find((m) => m.id === notesReId) ?? null;
            return (
              <div key={g.key} className="relative flex-none">
                <GroupCard
                  mode="view"
                  group={{ code: g.code, label: g.label }}
                  entries={g.members.map((re, i) => ({
                    exercise: toCardExercise(re, settings),
                    sets: [...re.sets]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((s, j) => toCardSet(s, j + 1)),
                    code: g.size > 1 ? memberCode(g.code, i) : g.code,
                  }))}
                  visibleColumns={visibleColumns}
                  onAction={handleGroupAction(g.members)}
                />
                {notesMember ? (
                  <ExerciseNotesPopover
                    exerciseName={notesMember.exercise.name}
                    notes={notesMember.exercise.notes ?? null}
                    open
                    onClose={() => setNotesReId(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </GroupCardStack>
      </div>
    );
  };

  // ---------- day header (56px accordion row) ----------
  const renderDayHeader = (day: RoutineDayDTO, index: number) => {
    const open = effectiveOpen(day.id);
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    const isCursorDay = !!followed && index === followed.cursorDayIndex;
    const isDone = completedIds.has(day.id);
    return (
      <div
        data-row
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Day ${index + 1} ${day.name}${isRest ? " — rest day" : ""}${isCursorDay ? " — today" : ""}${isDone ? " — completed" : ""}`}
        {...tourAttrs({ id: "programDetail.dayRow", label: "Day row", help: "Open to see this day's exercise groups.", order: 70 })}
        className="relative flex h-14 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap pl-3 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          toggleDay(day.id);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleDay(day.id);
          }
        }}
        onPointerDown={beginLongPress(day.id)}
        onPointerMove={longPressMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={openDayMenu(day.id)}
      >
        {/* 4px cursor accent bar — the followed program's current day */}
        {isCursorDay ? (
          <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-6 flex-none p-0"
          onClick={(e) => {
            e.stopPropagation();
            toggleDay(day.id);
          }}
          aria-label={open ? `Collapse ${day.name}` : `Expand ${day.name}`}
          aria-expanded={open}
          tour={{ id: "programDetail.dayToggle", label: "Day chevron", help: "Expand or collapse this day's exercises.", order: 80 }}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")}
            aria-hidden
          />
        </Button>
        <span className="w-14 flex-none text-xs font-semibold leading-none text-muted-foreground">
          Day {index + 1}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold leading-none",
            isRest && "text-muted-foreground",
          )}
        >
          {isRest ? (
            <Moon className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          ) : null}
          {day.name}
        </span>
        {/* right status chip: ✓ completed · "Today" cursor day */}
        {isDone ? (
          <span
            {...tourAttrs({ id: "programDetail.doneChip", label: "Done chip", help: "This day is already completed.", order: 90 })}
            className="flex h-6 flex-none items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2 text-[10px] font-bold uppercase leading-none text-emerald-600 dark:border-emerald-400/30 dark:text-emerald-400"
            aria-label={`${day.name} completed`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : isCursorDay ? (
          <span
            {...tourAttrs({ id: "programDetail.todayChip", label: "Today chip", help: "The current day in your followed program.", order: 100 })}
            className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
          >
            Today
          </span>
        ) : null}
        {/* ⋮ = the same menu long-press opens (Schedule · Favourite · Mark off · History) */}
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu open={menuDayId === day.id} onOpenChange={(o) => setMenuDayId(o ? day.id : null)}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`Actions for ${day.name}`}
                tour={{ id: "programDetail.dayMenu", label: "Day menu", help: "Schedule, favourite, mark off or check this day's history.", order: 140 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setScheduleDay(day)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Schedule…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleDayFavourite(day)}>
                <Star className="h-4 w-4" aria-hidden fill={day.isFavorite ? "currentColor" : "none"} />
                {day.isFavorite ? "Unfavourite" : "Favourite"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  completedIds.has(day.id) ? void unmarkDayDone(day) : void markDayDone(day)
                }
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {completedIds.has(day.id) ? "Unmark off" : "Mark off"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/logs?routineId=${routineId}&dayId=${day.id}`)}>
                <History className="h-4 w-4" aria-hidden /> History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    );
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/programs" label="Back to Programs" />}
          title={routine ? routine.name : "Program"}
          actions={
            routine ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                      tour={{ id: "programDetail.menu", label: "Program menu", help: "Edit in Builder, schedule, skip, jump, unfollow, copy or delete.", order: 50 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate(`/builder/program/${routineId}`)}>
                      <Hammer className="h-4 w-4" aria-hidden /> Edit in Builder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!scheduleTargetDay}
                      onClick={() => scheduleTargetDay && setScheduleDay(scheduleTargetDay)}
                    >
                      <CalendarClock className="h-4 w-4" aria-hidden /> Schedule day…
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!followed} onClick={() => void skipCursorDay()}>
                      <SkipForward className="h-4 w-4" aria-hidden /> Skip day
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!followed} onClick={() => setJumpOpen((o) => !o)}>
                      <ArrowDownUp className="h-4 w-4" aria-hidden /> Jump to day…
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!followed} onClick={() => setUnfollowOpen(true)}>
                      <StarOff className="h-4 w-4" aria-hidden /> Unfollow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyRoutine()}>
                      <Copy className="h-4 w-4" aria-hidden /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteRoutineOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <TopBarHelp />
              </>
            ) : (
              <TopBarHelp />
            )
          }
        />
      }
      subBar={
        <SubBar>
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" aria-label="Program details">
            {routine
              ? programMetaLine({
                  difficulty: routine.difficulty ?? null,
                  daysPerWeek: routine.daysPerWeek ?? null,
                  dayCount: routine.days.length,
                  estMinutes: routine.estMinutes ?? null,
                }) ||
                `${routine.days.length} ${routine.days.length === 1 ? "day" : "days"}`
              : "Program"}
          </p>
        </SubBar>
      }
      bottomBar={
        routine ? (
          <BottomBar>
            {followed ? (
              (followed.dayType ?? "WORKOUT") === "REST" ? (
                <Button
                  type="button"
                  className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                  aria-label="Train anyway on this rest day"
                  tour={{ id: "programDetail.trainAnyway", label: "Train anyway", help: "Pick a ready session to train on a rest day.", order: 140 }}
                  onClick={() => navigate("/on-demand")}
                >
                  Train anyway
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                  disabled={startBusy}
                  aria-label={`Start day ${followed.cursorDayIndex + 1} of ${followed.dayCount}`}
                  tour={{ id: "programDetail.startDay", label: "Start day", help: "Create today's session from the current day and start logging.", order: 130 }}
                  onClick={() => void startDay()}
                >
                  {startBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                  {isSession ? "Start session" : `Start Day ${followed.cursorDayIndex + 1}`}
                </Button>
              )
            ) : hasWorkoutDay ? (
              <Button
                type="button"
                className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                aria-label={`Follow ${routine.name}`}
                tour={{ id: "programDetail.follow", label: "Follow", help: "Make this program drive your daily workouts.", order: 120 }}
                onClick={onFollowClick}
              >
                Follow
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                    aria-label="Follow disabled — needs a workout day"
                    tour={{ skipTour: true, reason: "Disabled follow; program has no workout day" }}
                  >
                    Follow
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Needs at least one workout day</TooltipContent>
              </Tooltip>
            )}
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Program not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing program" }}
              onClick={() => navigate("/programs")}
            >
              Back to programs
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading program">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : routine ? (
          <>
            {/* §3.5 following row — only when this program is the active one */}
            {followed ? (
              <div
                data-row
                aria-label="Program cursor"
                {...tourAttrs({ id: "programDetail.following", label: "Following day", help: "Where you are in this program — day number and day name.", order: 60 })}
                className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 px-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                  Day {followed.cursorDayIndex + 1}/{followed.dayCount} · {followed.dayName}
                </span>
              </div>
            ) : null}

            {jumpOpen && followed ? (
              // ---------- Jump list — REPLACES the day sections ----------
              <div className="flex flex-col gap-2" aria-label="Jump to day">
                <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="truncate">Jump to day</span>
                </p>
                {days.map((day, index) => {
                  const isRest = (day.dayType ?? "WORKOUT") === "REST";
                  const isCurrent = index === followed.cursorDayIndex;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      data-row
                      aria-label={`Jump to Day ${index + 1} · ${day.name}`}
                      aria-current={isCurrent ? "true" : undefined}
                      {...tourAttrs({ id: "programDetail.jumpRow", label: "Day row", help: "Move the program cursor to this day.", order: 110 })}
                      onClick={() => {
                        setJumpOpen(false);
                        void jumpToDay(index);
                      }}
                      className={cn(
                        "flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left text-sm transition-colors",
                        isCurrent
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      )}
                    >
                      <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">
                        Day {index + 1}
                      </span>
                      {isRest ? (
                        <Moon className="h-4 w-4 flex-none text-muted-foreground/70" aria-hidden />
                      ) : (
                        <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
                      )}
                      <span className={cn("min-w-0 flex-1 truncate font-medium", isRest && "text-muted-foreground")}>
                        {day.name}
                      </span>
                      <span
                        className={cn(
                          "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
                          isRest
                            ? "border-border text-muted-foreground"
                            : "border-primary/40 text-primary",
                        )}
                      >
                        {isRest ? "Rest" : "Workout"}
                      </span>
                      {isCurrent ? (
                        <Check className="h-4 w-4 flex-none text-primary" aria-label="Current day" />
                      ) : null}
                    </button>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-none"
                  tour={{ skipTour: true, reason: "Cancel row inside the jump-to-day list" }}
                  onClick={() => setJumpOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                {days.map((day, index) => (
                  <DaySection key={day.id} open={effectiveOpen(day.id)} header={renderDayHeader(day, index)}>
                    {renderDayBody(day)}
                  </DaySection>
                ))}

                {days.length === 0 ? (
                  <div className="flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
                    <p className="text-sm font-semibold">No days yet</p>
                    <p className="max-w-[280px] text-center text-xs text-muted-foreground">
                      Build this program&apos;s training days in the Builder.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-1.5"
                      tour={{ id: "programDetail.openBuilder", label: "Open Builder", help: "Open this program in the Builder to add days.", order: 150, when: ["empty"] }}
                      onClick={() => navigate(`/builder/program/${routineId}`)}
                    >
                      <Hammer className="h-4 w-4" aria-hidden />
                      Open in Builder
                    </Button>
                  </div>
                ) : null}
              </>
            )}

            {/* day scheduling (day ⋮ + TopBar ⋮ "Schedule day…") */}
            <DatePickerDialog
              open={scheduleDay != null}
              onOpenChange={(o) => !o && setScheduleDay(null)}
              initialKey={todayKey()}
              title={`Schedule ${scheduleDay?.name ?? "day"}`}
              description={`Which date should ${routine.name} · ${scheduleDay?.name ?? "this day"} land on?`}
              onSelect={(dayKey) => {
                const day = scheduleDay;
                setScheduleDay(null);
                if (day) scheduleRoutineDay(day, dayKey);
              }}
            />
            {scheduleCreate.conflictDialog}
          </>
        ) : null}
      </ScrollBody>

      {/* confirm-destructive: program delete */}
      <AlertDialog open={deleteRoutineOpen} onOpenChange={(o) => !o && setDeleteRoutineOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete program?</AlertDialogTitle>
            <AlertDialogDescription>
              “{routine?.name}” and its {days.length} day{days.length === 1 ? "" : "s"} will be removed. Logged
              workouts stay untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setDeleteRoutineOpen(false);
                void removeRoutine();
              }}
            >
              Delete program
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* confirm: unfollow the program (⏪ no Undo — follow restarts at Day 1) */}
      <AlertDialog open={unfollowOpen} onOpenChange={(o) => !o && setUnfollowOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow {routine?.name ?? "this program"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your followed-program card and day rollover stop updating. Logged workouts stay untouched —
              you can follow again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setUnfollowOpen(false);
                void unfollowProgram();
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* destructive confirm: replace the followed program */}
      <AlertDialog open={followReplaceOpen} onOpenChange={(o) => !o && setFollowReplaceOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unfollow {active?.routineName ?? "your program"} and start {routine?.name} from Day 1?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only one program can drive your daily workouts and day rollover at a time. Your logged
              workouts are never touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setFollowReplaceOpen(false);
                void followProgram();
              }}
            >
              Start from Day 1
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
