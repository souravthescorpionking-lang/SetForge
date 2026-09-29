"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — the Part 3 rebuild of #/routines/{id}.
//
//   TopBar (56)  : back → #/routines | routine name (tap = inline rename,
//                  Enter saves / Esc cancels) | `Edit`⇄`Done` toggle | ⋮
//                  (Rename · Copy · Reorder days · Delete confirm)
//   SubBar (48)  : notes single line ellipsis — tap expands (read mode, max
//                  3 lines, tap again collapses); in edit mode the block below
//                  is an inline textarea (persist on blur). Hidden when empty
//                  and not editing.
//   ScrollBody   : DaySection×N accordion (mobile: one day open; ≥768: all
//                  open; animates grid-template-rows 0fr→1fr, never height).
//                  DayHeader 48px: chevron | day name (inline rename in edit
//                  mode) | `Log` 72px (read) or ⋮ 44px (edit: Rename · Move
//                  up/down · Delete confirm). Body: ExerciseCard×N template
//                  mode (blank cells ↺ = copy from last workout; set edits
//                  persist immediately). Edit mode adds drag-handle glyphs in
//                  card headers, `+ Add exercise to day` 40px ghost rows and a
//                  `+ Add day` 48px footer row.
//
// Edit mode is a whole-screen state. NO per-item edit dialogs — everything is
// inline. Dialogs: routine Delete + day Delete (confirm-destructive) only.
// Drag handles are rendered but DnD is NOT wired (reorder via ⋮ Move up/down).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
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
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Dumbbell,
  ExternalLink,
  Hammer,
  Layers,
  Moon,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  SkipForward,
  Star,
  StickyNote,
  Tags,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { programsApi, programsMetaApi, routinesApi, scheduleApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline } from "@/lib/client/query";
import { useHashRoute } from "@/features/shell/router";
import { formatDayLabel, todayKey, addDaysKey } from "@/lib/client/format";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { computeGroupCodes } from "@/lib/group-codes";
import { MuscleDots } from "@/components/shared/muscle-dots";
import type { CardAction, CardSet, CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import { ExerciseCard } from "@/components/exercise-card/exercise-card";
import { useViewportWidth } from "@/components/set-row/viewport";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";
import {
  DragGlyph,
  InlineInput,
  cardPatchToPredefinedInput,
  cardSetsOf,
  errorMessage,
  nextDayName,
  toCardExercise,
  useDayReorder,
  useLastSetsPrefill,
  useProgramRun,
  useRoutineRun,
} from "./screen-helpers";
import { DayActionRow } from "./day-action-row";
import { ProgramHeaderBlock, TotalsRow } from "./header-block";
import { programExtraKeys, useProgramExtras, unmarkDayOffFull } from "./program-meta";
import { cn } from "@/lib/utils";

/** ≥768px: every day section opens (tablet/desktop accordion rule). */
const WIDE_DAY_VIEWPORT = 768;

const chipClass = (active: boolean) =>
  cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

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

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — keyed by routineId so every local UI state (edit mode,
// open day, collapses, renames, notes draft) resets naturally on navigation.
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
  const prefillFor = useLastSetsPrefill();
  const route = useHashRoute();
  const scheduleCreate = useScheduleCreate();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  // follow state (cursor strip) — the dashboard carries the active program
  const { data: dashboardData } = useDashboard();
  const active = dashboardData?.active ?? null;
  const followed = active && active.routineId === routineId ? active : null;
  const isSession = (routine?.kind ?? "ROUTINE") === "SESSION";

  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );

  // ---------- ui state ----------
  const vw = useViewportWidth();
  const isWide = vw >= WIDE_DAY_VIEWPORT;
  const [editing, setEditing] = useState(false);
  // undefined = follow the default (first day open); "" = all collapsed.
  const [openDayId, setOpenDayId] = useState<string | undefined>(undefined);
  const [collapsedReIds, setCollapsedReIds] = useState<Set<string>>(new Set());
  const [renamingRoutine, setRenamingRoutine] = useState(false);
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [deleteRoutineOpen, setDeleteRoutineOpen] = useState(false);
  const [deleteDay, setDeleteDay] = useState<RoutineDayDTO | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesReId, setNotesReId] = useState<string | null>(null);

  // Part 5 state: cursor jump list / day scheduling / session start
  const [jumpOpen, setJumpOpen] = useState(
    () => route.query.get("jump") === "1" && route.name === "program-detail",
  );
  const [scheduleDay, setScheduleDay] = useState<RoutineDayDTO | null>(null);
  const [sessionScheduleOpen, setSessionScheduleOpen] = useState(false);
  const [startBusy, setStartBusy] = useState(false);

  // Part 6 §4.5 state: routine favourite / labels editor / phase filter /
  // local completion deltas (Done chips + HeaderBlock ring stay live while
  // the invalidated queries refetch)
  const [favPending, setFavPending] = useState<boolean | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [addingLabel, setAddingLabel] = useState(false);
  const [phaseChip, setPhaseChip] = useState<string>("ALL");
  const [completedDelta, setCompletedDelta] = useState<Map<string, boolean>>(new Map());
  const invalidateExtras = useProgramExtras();

  // §4.5 — program totals + schedule entries (DONE entries feed the ring/Done
  // chips; the window covers a full training year back + 2 months forward)
  const totalsQuery = useQuery({
    queryKey: programExtraKeys.totals(routineId),
    queryFn: () => programsMetaApi.totals(routineId),
    enabled: !!routine,
  });
  const scheduleEntriesQuery = useQuery({
    queryKey: programExtraKeys.schedule(routineId),
    queryFn: () =>
      scheduleApi.list({ from: addDaysKey(todayKey(), -400), to: addDaysKey(todayKey(), 60) }),
  });

  const phases = routine?.phases ?? [];
  const phaseDayIds =
    phaseChip === "ALL"
      ? null
      : new Set(phases.find((p) => p.name === phaseChip)?.dayIds ?? []);

  // completed days = activeRoutine.completedDayIds ∪ DONE schedule entries
  // (§4.5 fallback: unfollowed routines count only their DONE entries)
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

  const workoutDays = useMemo(
    () => days.filter((d) => (d.dayType ?? "WORKOUT") === "WORKOUT"),
    [days],
  );
  const completedWorkoutCount = workoutDays.filter((d) => completedIds.has(d.id)).length;
  const totalWorkoutCount = workoutDays.length;

  // union of equipment across every day's exercises (HeaderBlock expansion)
  const equipmentUnion = useMemo(() => {
    const s = new Set<string>();
    for (const d of days) for (const re of d.exercises) for (const e of re.exercise.equipment ?? []) s.add(e);
    return [...s];
  }, [days]);

  // routine favourite — optimistic pending flag, resynced during render
  const routineIsFav = favPending ?? (routine?.isFavorite ?? false);
  if (favPending != null && routine && favPending === (routine.isFavorite ?? false)) {
    setFavPending(null);
  }

  const effectiveOpen = (dayId: string) =>
    isWide ? true : (openDayId ?? days[0]?.id ?? "") === dayId;

  const toggleDay = (dayId: string) => {
    const current = openDayId ?? days[0]?.id ?? "";
    setOpenDayId(current === dayId ? "" : dayId);
  };

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  // ---------- routine-level mutations ----------
  const renameRoutine = async (name: string) => {
    if (!routine || !name || name === routine.name) return;
    const ok = await run(() => routinesApi.update(routineId, { name }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { name },
      label: "Routine renamed",
    });
    if (ok) toast.success("Routine renamed");
  };

  const saveNotes = async () => {
    if (!routine) return;
    const next = notesDraft.trim();
    if (next === (routine.notes ?? "")) return;
    const ok = await run(() => routinesApi.update(routineId, { notes: next || null }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { notes: next || null },
      label: "Notes saved",
    });
    if (ok) toast.success("Notes saved");
  };

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

  // ---------- Part 6 §4.5: favourite / labels / mark-off mutations ----------

  const toggleRoutineFavourite = async () => {
    if (!routine) return;
    if (!online) {
      toast.info("Favourite programs need a connection");
      return;
    }
    const next = !routineIsFav;
    setFavPending(next);
    try {
      await programsMetaApi.update(routineId, { isFavorite: next });
      invalidate.routines();
      invalidateExtras(routineId);
      toast.success(
        next ? `“${routine.name}” added to favourites` : `“${routine.name}” removed from favourites`,
      );
    } catch (e) {
      setFavPending(null);
      toast.error(errorMessage(e));
    }
  };

  const saveLabels = async (labels: string[]) => {
    if (!routine) return;
    if (!online) {
      toast.info("Editing labels needs a connection");
      return;
    }
    try {
      await programsMetaApi.update(routineId, { labels });
      invalidate.routines();
      invalidateExtras(routineId);
      toast.success("Labels saved");
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

  // ---------- day-level mutations ----------
  const renameDay = async (day: RoutineDayDTO, name: string) => {
    if (!name || name === day.name) return;
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { name }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { name },
      label: "Day renamed",
    });
    if (ok) toast.success("Day renamed");
  };

  const removeDay = async (day: RoutineDayDTO) => {
    const ok = await run(() => routinesApi.removeDay(routineId, day.id), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "DELETE",
      label: `Deleted ${day.name}`,
    });
    if (ok) toast.success(`Deleted “${day.name}”`);
  };

  const reorderDay = useDayReorder(routineId);

  const addDay = async () => {
    if (!routine) return;
    if (!online) {
      toast.info("Adding a day needs a connection");
      return;
    }
    try {
      const updated = await routinesApi.addDay(routineId, nextDayName(routine.days));
      invalidate.routines();
      const oldIds = new Set(routine.days.map((d) => d.id));
      const created = [...updated.days].sort((a, b) => b.sortOrder - a.sortOrder).find((d) => !oldIds.has(d.id)) ?? null;
      if (created) {
        setOpenDayId(created.id);
        setRenamingDayId(created.id);
      }
      toast.success("Day added");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- Part 5: cursor / day-type / scheduling mutations ----------

  const jumpToDay = async (dayIndex: number) => {
    const res = await programRun(
      () => programsApi.jumpCursor(dayIndex),
      { path: "/api/programs/cursor/jump", method: "POST", body: { dayIndex }, label: "Cursor moved" },
    );
    if (res) toast.success(`Day ${res.dayIndex + 1} · ${res.day.name}`);
  };

  const prevCursorDay = () => {
    if (!followed) return;
    const n = followed.dayCount;
    const i = followed.cursorDayIndex;
    void jumpToDay((i - 1 + n) % n);
  };

  const skipCursorDay = async () => {
    const res = await programRun(
      () => programsApi.skipCursorDay(),
      { path: "/api/programs/cursor/skip", method: "POST", label: "Day skipped" },
    );
    if (res) toast.success(`Skipped ${res.skipped.name} · ${res.day.name} up next`);
  };

  const toggleDayType = async (day: RoutineDayDTO, dayType: "WORKOUT" | "REST") => {
    if ((day.dayType ?? "WORKOUT") === dayType) return;
    const ok = await run(
      () => routinesApi.updateDay(routineId, day.id, { dayType }),
      {
        path: `/api/routines/${routineId}/days/${day.id}`,
        method: "PATCH",
        body: { dayType },
        label: "Day type changed",
      },
    );
    if (ok) {
      invalidate.programs();
      toast.success(`${day.name} → ${dayType === "REST" ? "rest day" : "workout day"}`);
    }
  };

  const startSessionToday = async () => {
    if (!online) {
      toast.info("Starting a session needs a connection");
      return;
    }
    setStartBusy(true);
    try {
      await programsApi.startDay(routineId);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${routine?.name ?? "session"}`);
      navigate("/today");
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

  const scheduleSession = (dateKey: string) => {
    if (!routine) return;
    void scheduleCreate.create({
      date: dateKey,
      routineId,
      toastLabel: `Scheduled ${routine.name} for ${formatDayLabel(dateKey)}`,
    });
  };

  // ---------- card (template) mutations ----------
  const reorderExercises = async (dayId: string, ids: string[], reId: string, delta: -1 | 1) => {
    const i = ids.indexOf(reId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    await run(() => routinesApi.reorderExercises(routineId, dayId, next), {
      path: `/api/routines/${routineId}/days/${dayId}/exercises/order`,
      method: "PUT",
      body: { ids: next },
      label: "Exercise order",
    });
  };

  const patchPredefinedSet = async (
    day: RoutineDayDTO,
    re: RoutineExerciseDTO,
    setId: string,
    patch: Partial<CardSet>,
  ) => {
    const input = cardPatchToPredefinedInput(patch);
    if (Object.keys(input).length === 0) return; // note-only: predefined sets carry no comments
    await run(() => routinesApi.updateSet(routineId, day.id, re.id, setId, input), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "PATCH",
      body: input,
      label: "Set updated",
    });
  };

  const removePredefinedSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO, setId: string) => {
    await run(() => routinesApi.removeSet(routineId, day.id, re.id, setId), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "DELETE",
      label: "Set removed",
    });
  };

  const addPredefinedSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO) => {
    await run(() => routinesApi.addSet(routineId, day.id, re.id, {}), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const copyLastToSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO, setId: string) => {
    const sorted = [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = await prefillFor(re.exerciseId, idx);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    await run(
      () =>
        routinesApi.updateSet(routineId, day.id, re.id, setId, {
          weight: src.weight,
          reps: src.reps,
          distance: src.distance,
          timeSec: src.timeSec,
        }),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
        method: "PATCH",
        body: { weight: src.weight, reps: src.reps, distance: src.distance, timeSec: src.timeSec },
        label: "Copied from last workout",
      },
    );
    toast.success("Copied from last workout");
  };

  const removeRoutineExercise = async (day: RoutineDayDTO, re: RoutineExerciseDTO) => {
    await run(() => routinesApi.removeExercise(routineId, day.id, re.id), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}`,
      method: "DELETE",
      label: `Removed ${re.exercise.name}`,
    });
    toast.success(`${re.exercise.name} removed from day`);
  };

  // ---------- card action dispatch ----------
  const handleCardAction = (day: RoutineDayDTO, re: RoutineExerciseDTO) => (action: CardAction): void => {
    switch (action.type) {
      case "toggle-collapse":
        setCollapsedReIds((prev) => {
          const next = new Set(prev);
          if (next.has(re.id)) next.delete(re.id);
          else next.add(re.id);
          return next;
        });
        break;
      case "add-set":
        void addPredefinedSet(day, re);
        break;
      case "update-set":
        void patchPredefinedSet(day, re, action.setId, action.patch);
        break;
      case "remove-set":
        void removePredefinedSet(day, re, action.setId);
        break;
      case "copy-last":
        void copyLastToSet(day, re, action.setId);
        break;
      case "move-up":
      case "move-down": {
        const ids = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.id);
        void reorderExercises(day.id, ids, re.id, action.type === "move-up" ? -1 : 1);
        break;
      }
      case "remove":
        void removeRoutineExercise(day, re);
        break;
      case "notes":
        setNotesReId(re.id);
        break;
      case "add-to-group":
        toast.info("Routine groups arrive with a later build");
        break;
      case "replace":
        toast.info("Replacing exercises in templates arrives with a later build");
        break;
      case "select":
        toast.info("Multi-select arrives with the next build");
        break;
      case "rest-timer":
        toast.info("The rest timer lives on the Today screen");
        break;
      case "toggle-done":
      case "toggle-select":
      case "open":
        break; // preview/edit-mode-only actions; never emitted by template cards
    }
  };

  // ---------- render helpers ----------
  const renderDayHeader = (day: RoutineDayDTO, index: number) => {
    const open = effectiveOpen(day.id);
    const renaming = editing && renamingDayId === day.id;
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    const isCursorDay = !!followed && index === followed.cursorDayIndex;
    return (
      <div
        data-row
        className="relative flex h-14 items-center gap-1 overflow-hidden whitespace-nowrap pl-3 pr-1"
      >
        {/* 4px cursor accent bar — the followed program's current day */}
        {isCursorDay ? (
          <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-6 flex-none p-0"
          onClick={() => toggleDay(day.id)}
          aria-label={open ? `Collapse ${day.name}` : `Expand ${day.name}`}
          aria-expanded={open}
          tour={{ id: "programDetail.dayToggle", label: "Day chevron", help: "Expand or collapse this day's exercises.", order: 80 }}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")}
            aria-hidden
          />
        </Button>
        {renaming ? (
          <InlineInput
            value={day.name}
            ariaLabel={`Rename ${day.name}`}
            onCommit={(name) => {
              setRenamingDayId(null);
              void renameDay(day, name);
            }}
            onCancel={() => setRenamingDayId(null)}
            className="h-10 min-w-0 flex-1"
          />
        ) : (
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
        )}
        {/* §4.5 read mode: ≤3 muscle dots · ~Xm · Done chip (after the name) */}
        {!editing && !isRest ? (
          <MuscleDots muscles={day.primaryMuscles} show={settings?.showMuscleChips ?? true} max={3} />
        ) : null}
        {!editing && !isRest && day.estMinutes != null ? (
          <span
            className="flex-none text-xs leading-none text-muted-foreground"
            title="Estimated duration"
          >
            ~{day.estMinutes}m
          </span>
        ) : null}
        {isCursorDay ? (
          <span className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary">
            Today
          </span>
        ) : null}
        {editing && !isSession ? (
          <>
            {/* day type segmented control (edit mode, routines only) */}
            <div
              role="radiogroup"
              aria-label={`Day type for ${day.name}`}
              className="mr-1 flex h-11 w-[88px] flex-none items-center gap-0.5 rounded-lg border bg-background p-0.5"
            >
              {(["WORKOUT", "REST"] as const).map((t) => {
                const selected = (day.dayType ?? "WORKOUT") === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${t === "WORKOUT" ? "Workout" : "Rest"} day`}
                    onClick={() => void toggleDayType(day, t)}
                    {...tourAttrs(
                      t === "WORKOUT"
                        ? { id: "programDetail.dayTypeWorkout", label: "Workout day", help: "Make this a training day with exercises.", order: 160, when: ["edit"] }
                        : { id: "programDetail.dayTypeRest", label: "Rest day", help: "Turn this day into a scheduled rest day.", order: 170, when: ["edit"] },
                    )}
                    className={cn(
                      "h-10 min-w-0 flex-1 rounded-md text-[11px] font-bold leading-none transition-colors",
                      selected
                        ? t === "WORKOUT"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {t === "WORKOUT" ? "Workout" : "Rest"}
                  </button>
                );
              })}
            </div>
            <span className="flex flex-none">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Actions for ${day.name}`}
                    tour={{ id: "programDetail.dayMenu", label: "Day menu", help: "Rename, move, arrange or delete this day.", order: 180, when: ["edit"] }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setRenamingDayId(day.id)}>
                    <Pencil className="h-4 w-4" aria-hidden /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === 0}
                    onClick={() => void reorderDay(days, index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === days.length - 1}
                    onClick={() => void reorderDay(days, index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden /> Move down
                  </DropdownMenuItem>
                  {!isRest ? (
                    <DropdownMenuItem
                      onClick={() => navigate(`/programs/${routineId}/day/${day.id}/arrange`)}
                    >
                      <ArrowDownUp className="h-4 w-4" aria-hidden /> Arrange exercises
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteDay(day)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </>
        ) : editing ? (
          <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 p-0"
                  aria-label={`Actions for ${day.name}`}
                  tour={{ id: "programDetail.dayMenu", label: "Day menu", help: "Rename or arrange this session day.", order: 180, when: ["edit"] }}
                >
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setRenamingDayId(day.id)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Rename
                </DropdownMenuItem>
                {!isRest ? (
                  <DropdownMenuItem onClick={() => navigate(`/programs/${routineId}/day/${day.id}/arrange`)}>
                    <ArrowDownUp className="h-4 w-4" aria-hidden /> Arrange exercises
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : (
          <>
            {/* §4.5: Done chip — tap to un-mark (Undo re-marks) */}
            {completedIds.has(day.id) ? (
              <button
                type="button"
                className="flex h-8 w-12 flex-none items-center justify-center gap-1 rounded-md border border-emerald-600/30 bg-emerald-600/15 text-[11px] font-bold uppercase leading-none text-emerald-600 transition-colors hover:bg-emerald-600/25 dark:border-emerald-400/30 dark:text-emerald-400"
                aria-label={`${day.name} marked off — tap to unmark`}
                {...tourAttrs({ id: "programDetail.doneChip", label: "Done chip", help: "Tap to unmark this completed day.", order: 90 })}
                onClick={() => void unmarkDayDone(day)}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Done
              </button>
            ) : null}
            {/* read-mode ⋮: Open day (§4.6 route) + the Part 5 log/schedule flows */}
            <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Actions for ${day.name}`}
                    tour={{ id: "programDetail.dayMenu", label: "Day menu", help: "Open, arrange, log or schedule this day.", order: 180 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate(`/programs/${routineId}/day/${day.id}`)}>
                    <ExternalLink className="h-4 w-4" aria-hidden /> Open day
                  </DropdownMenuItem>
                  {!isRest ? (
                    <DropdownMenuItem onClick={() => navigate(`/programs/${routineId}/day/${day.id}/arrange`)}>
                      <ArrowDownUp className="h-4 w-4" aria-hidden /> Arrange exercises
                    </DropdownMenuItem>
                  ) : null}
                  {!isRest ? (
                    <DropdownMenuItem onClick={() => navigate(`/programs/${routineId}/log/${day.id}`)}>
                      <Zap className="h-4 w-4" aria-hidden /> Log day
                    </DropdownMenuItem>
                  ) : null}
                  {!isRest ? (
                    <DropdownMenuItem onClick={() => setScheduleDay(day)}>
                      <CalendarClock className="h-4 w-4" aria-hidden /> Schedule…
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </>
        )}
      </div>
    );
  };

  const renderDayBody = (day: RoutineDayDTO) => {
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    const exercises = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
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
    // §4.10: derived group codes (A1, A2…) for grouped template exercises
    const { codes: groupCodes } = computeGroupCodes(exercises);
    return (
      <div className="flex flex-col gap-2 p-2">
        {/* §4.5: shared DayActionRow (favourite · schedule · history · mark off) */}
        {editing ? null : (
          <DayActionRow
            routineId={routineId}
            dayId={day.id}
            dayName={day.name}
            isFavorite={day.isFavorite ?? false}
            isCompleted={completedIds.has(day.id)}
            onSchedule={() => setScheduleDay(day)}
            onCompletedChange={(completed) => applyCompletedDelta(day.id, completed)}
          />
        )}
        {exercises.map((re) => {
          const openNotes = notesReId === re.id;
          return (
            <div key={re.id} className="relative flex-none">
              <ExerciseCard
                mode="template"
                exercise={toCardExercise(re, settings)}
                sets={cardSetsOf(re)}
                collapsed={collapsedReIds.has(re.id)}
                visibleColumns={visibleColumns}
                headerLeading={editing ? <DragGlyph /> : undefined}
                groupCode={groupCodes.get(re.id)}
                onAction={handleCardAction(day, re)}
              />
              {openNotes ? (
                <ExerciseNotesPopover
                  exerciseName={re.exercise.name}
                  notes={re.exercise.notes ?? null}
                  open
                  onClose={() => setNotesReId(null)}
                />
              ) : null}
            </div>
          );
        })}
        {exercises.length === 0 ? (
          <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No exercises in this day yet.
          </p>
        ) : null}
        {editing ? (
          <button
            type="button"
            data-row
            className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
            {...tourAttrs({ id: "programDetail.addExercise", label: "Add exercise", help: "Pick an exercise to append to this day.", order: 190, when: ["edit"] })}
            onClick={() => navigate(`/exercises?context=routine&routineId=${routineId}&dayId=${day.id}`)}
          >
            <Plus className="h-4 w-4 flex-none" aria-hidden />
            Add exercise to day
          </button>
        ) : null}
      </div>
    );
  };

  const notesVisible = editing || !!(routine?.notes && routine.notes.trim().length > 0);

  // §4.5 labels editor (TopBar ⋮ → Labels): chip row + remove × + new-label input
  const labelsEditor = routine ? (
    <div className="flex flex-none flex-col gap-2 rounded-lg border bg-card p-2" aria-label="Program labels">
      <div
        data-row
        data-chip-scroller
        className="no-scrollbar flex h-10 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
      >
        {(routine.labels ?? []).length === 0 ? (
          <span className="flex-none text-xs text-muted-foreground">No labels yet — add one below.</span>
        ) : (
          (routine.labels ?? []).map((l) => (
            <span
              key={l}
              className="flex h-8 flex-none items-center gap-1 rounded-full border px-3 text-xs font-semibold"
            >
              {l}
              <button
                type="button"
                aria-label={`Remove label ${l}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                {...tourAttrs({ skipTour: true, reason: "Label remove chip inside the labels editor" })}
                onClick={() => void saveLabels((routine.labels ?? []).filter((x) => x !== l))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))
        )}
      </div>
      {addingLabel ? (
        <div
          data-row
          className="flex h-12 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-2 pr-1"
        >
          <Tags className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
          <InlineInput
            value=""
            placeholder="New label…"
            ariaLabel="New label"
            onCommit={(name) => {
              setAddingLabel(false);
              const label = name.trim();
              if (!label) return;
              const labels = routine.labels ?? [];
              if (labels.includes(label)) {
                toast.info("That label already exists");
                return;
              }
              void saveLabels([...labels, label]);
            }}
            onCancel={() => setAddingLabel(false)}
            className="h-11 min-w-0 flex-1"
          />
        </div>
      ) : (
        <button
          type="button"
          data-row
          className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
          {...tourAttrs({ skipTour: true, reason: "New-label row inside the labels editor" })}
          onClick={() => setAddingLabel(true)}
        >
          <Plus className="h-4 w-4 flex-none" aria-hidden />
          New label
        </button>
      )}
    </div>
  ) : null;

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
              onClick={() => navigate("/programs")}
              aria-label="Back to programs"
              tour={{ id: "programDetail.back", label: "Back", help: "Return to the Programs list.", order: 10 }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            renamingRoutine || !routine ? (
              routine ? (
                <InlineInput
                  value={routine.name}
                  ariaLabel="Rename routine"
                  onCommit={(name) => {
                    setRenamingRoutine(false);
                    void renameRoutine(name);
                  }}
                  onCancel={() => setRenamingRoutine(false)}
                  className="h-11 min-w-0 w-full"
                />
              ) : (
                "Routine"
              )
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-base font-semibold leading-none"
                aria-label={`Rename ${routine.name}`}
                title="Tap to rename"
                {...tourAttrs({ id: "programDetail.rename", label: "Rename", help: "Tap the name to rename the program.", order: 20 })}
                onClick={() => setRenamingRoutine(true)}
              >
                {routine.name}
              </button>
            )
          }
          actions={
            routine ? (
              <>
                {/* §4.5: routine favourite (optimistic) */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-11 w-11 flex-none",
                    routineIsFav && "text-amber-500 hover:text-amber-500",
                  )}
                  aria-pressed={routineIsFav}
                  aria-label={routineIsFav ? `Unfavourite ${routine.name}` : `Favourite ${routine.name}`}
                  tour={{ id: "programDetail.favourite", label: "Favourite", help: "Star this program to find it faster.", order: 30 }}
                  onClick={() => void toggleRoutineFavourite()}
                >
                  <Star className="h-5 w-5" aria-hidden fill={routineIsFav ? "currentColor" : "none"} />
                </Button>
                <Button
                  type="button"
                  variant={editing ? "default" : "outline"}
                  className="h-11 flex-none px-4"
                  aria-pressed={editing}
                  tour={{ id: "programDetail.edit", label: "Edit toggle", help: "Turn inline edit mode on or off.", order: 40 }}
                  onClick={() => {
                    if (!editing) setNotesDraft(routine?.notes ?? ""); // draft starts from the saved notes
                    setEditing((e) => !e);
                  }}
                >
                  {editing ? "Done" : "Edit"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                      tour={{ id: "programDetail.menu", label: "Program menu", help: "Rename, labels, copy, reorder or delete.", order: 50 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setRenamingRoutine(true)}>
                      <Pencil className="h-4 w-4" aria-hidden /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setLabelsOpen((o) => !o);
                        setAddingLabel(false);
                      }}
                    >
                      <Tags className="h-4 w-4" aria-hidden /> Labels
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyRoutine()}>
                      <Copy className="h-4 w-4" aria-hidden /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(true);
                        toast.info("Edit mode on — use ⋮ on a day to move it up or down");
                      }}
                    >
                      <Layers className="h-4 w-4" aria-hidden /> Reorder days
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/programs/new/builder")}>
                      <Hammer className="h-4 w-4" aria-hidden /> Program builder
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
        isSession && routine ? (
          // SESSION: two equal actions — Start today | Schedule
          <SubBar>
            <div className="flex h-11 w-full items-center gap-2">
              <Button
                type="button"
                className="h-11 min-w-0 flex-1 gap-1.5 whitespace-nowrap text-sm font-bold"
                disabled={startBusy}
                aria-label={`Start ${routine.name} today`}
                tour={{ id: "programDetail.startToday", label: "Start today", help: "Start this session now and jump to Today.", order: 100 }}
                onClick={() => void startSessionToday()}
              >
                <Play className="h-4 w-4" aria-hidden />
                {startBusy ? "Starting…" : "Start today"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 flex-1 gap-1.5 whitespace-nowrap text-sm font-semibold"
                aria-label={`Schedule ${routine.name}`}
                tour={{ id: "programDetail.scheduleSession", label: "Schedule session", help: "Pick a date for this whole session.", order: 110 }}
                onClick={() => setSessionScheduleOpen(true)}
              >
                <CalendarClock className="h-4 w-4" aria-hidden />
                Schedule
              </Button>
            </div>
          </SubBar>
        ) : followed ? (
          // ROUTINE + followed: the cursor strip (Day i/n · name · ◀ · Skip · Jump…)
          <SubBar>
            <div
              data-row
              aria-label="Program cursor"
              className="flex h-11 w-full items-center gap-2 overflow-hidden whitespace-nowrap"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                Day {followed.cursorDayIndex + 1}/{followed.dayCount} · {followed.dayName}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-11 flex-none px-0"
                aria-label="Previous day"
                tour={{ id: "programDetail.prevDay", label: "Previous day", help: "Move the program cursor back one day.", order: 120 }}
                onClick={prevCursorDay}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-none gap-1 whitespace-nowrap px-3 text-xs font-bold"
                tour={{ id: "programDetail.skipDay", label: "Skip day", help: "Skip this day and advance the cursor.", order: 130 }}
                onClick={() => void skipCursorDay()}
              >
                Skip
                <SkipForward className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant={jumpOpen ? "default" : "outline"}
                aria-pressed={jumpOpen}
                className="h-11 flex-none whitespace-nowrap px-3 text-xs font-bold"
                tour={{ id: "programDetail.jump", label: "Jump", help: "Open the list and jump to any day.", order: 140 }}
                onClick={() => setJumpOpen((o) => !o)}
              >
                Jump…
              </Button>
            </div>
          </SubBar>
        ) : notesVisible ? (
          <SubBar>
            <button
              type="button"
              className="flex h-11 min-w-0 flex-1 items-center gap-2 text-left"
              aria-label={editing ? "Routine notes editor below" : "Expand routine notes"}
              aria-expanded={editing ? true : notesOpen}
              {...tourAttrs({ id: "programDetail.notes", label: "Notes", help: "Expand or collapse the program notes.", order: 70 })}
              onClick={() => {
                if (!editing) setNotesOpen((o) => !o);
              }}
            >
              <StickyNote className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {editing
                  ? routine?.notes?.trim()
                    ? "Notes — editing below"
                    : "Tap the field below to add notes"
                  : routine?.notes}
              </span>
              {editing ? null : (
                <ChevronDown
                  className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${notesOpen ? "" : "-rotate-90"}`}
                  aria-hidden
                />
              )}
            </button>
          </SubBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Routine not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing routine" }}
              onClick={() => navigate("/programs")}
            >
              Back to programs
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading routine">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : routine && jumpOpen && followed ? (
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
                  {...tourAttrs({ id: "programDetail.jumpRow", label: "Day row", help: "Move the program cursor to this day.", order: 150 })}
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
        ) : routine ? (
          <>
            {/* §4.5 labels editor — opened from the TopBar ⋮ */}
            {labelsOpen ? labelsEditor : null}

            {/* §4.5 program overview: HeaderBlock (ring + difficulty/highlights)
                · TotalsRow · phase chips — read mode only */}
            {!editing ? (
              <>
                <ProgramHeaderBlock
                  completed={completedWorkoutCount}
                  total={totalWorkoutCount}
                  difficulty={routine.difficulty ?? null}
                  daysPerWeek={routine.daysPerWeek ?? null}
                  estMinutes={routine.estMinutes ?? null}
                  highlights={routine.highlights ?? []}
                  equipment={equipmentUnion}
                  showEquipmentChips={settings?.showEquipmentChips ?? true}
                />
                <TotalsRow totals={totalsQuery.data} />
                {phases.length > 0 ? (
                  <div
                    data-row
                    data-chip-scroller
                    role="group"
                    aria-label="Phase filter"
                    className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
                  >
                    <button
                      type="button"
                      aria-pressed={phaseChip === "ALL"}
                      className={chipClass(phaseChip === "ALL")}
                      {...tourAttrs({ id: "programDetail.phaseAll", label: "All phases", help: "Show every day regardless of phase.", order: 210 })}
                      onClick={() => setPhaseChip("ALL")}
                    >
                      All
                    </button>
                    {phases.map((p, i) => {
                      const key = p.name || `Phase ${i + 1}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={phaseChip === key}
                          className={chipClass(phaseChip === key)}
                          {...tourAttrs({ skipTour: true, reason: "Data-driven phase filter chips" })}
                          onClick={() => setPhaseChip(key)}
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {followed && notesVisible ? (
              // notes relocate into the body while the cursor strip owns the SubBar
              <button
                type="button"
                data-row
                className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40"
                aria-label={editing ? "Routine notes editor below" : "Expand routine notes"}
                aria-expanded={editing ? true : notesOpen}
                {...tourAttrs({ id: "programDetail.notesInline", label: "Notes", help: "Tap to show this program's notes inline.", order: 70 })}
                onClick={() => {
                  if (!editing) setNotesOpen((o) => !o);
                }}
              >
                <StickyNote className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {editing
                    ? routine.notes?.trim()
                      ? "Notes — editing below"
                      : "Tap the field below to add notes"
                    : routine.notes}
                </span>
                {editing ? null : (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 flex-none text-muted-foreground transition-transform",
                      notesOpen ? "" : "-rotate-90",
                    )}
                    aria-hidden
                  />
                )}
              </button>
            ) : null}

            {editing ? (
              <textarea
                aria-label="Routine notes"
                rows={3}
                value={notesDraft}
                placeholder="Notes for this routine (e.g. progression scheme, rest rules)…"
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => void saveNotes()}
                {...tourAttrs({ skipTour: true, reason: "Notes draft textarea; the notes row anchors it" })}
                className="flex-none w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
              />
            ) : notesOpen && routine.notes ? (
              <p className="line-clamp-3 flex-none px-1 text-sm leading-relaxed text-muted-foreground">
                {routine.notes}
              </p>
            ) : null}

            {days
              .map((day, index) => ({ day, index }))
              .filter(({ day }) => !phaseDayIds || phaseDayIds.has(day.id))
              .map(({ day, index }) => (
                <DaySection key={day.id} open={effectiveOpen(day.id)} header={renderDayHeader(day, index)}>
                  {renderDayBody(day)}
                </DaySection>
              ))}

            {days.length === 0 ? (
              <div className="flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
                <p className="text-sm font-semibold">No days yet</p>
                <p className="max-w-[280px] text-center text-xs text-muted-foreground">
                  Split this routine into training days, then log a whole day in one tap.
                </p>
                {editing && !isSession ? (
                  <Button
                    type="button"
                    className="gap-1.5"
                    tour={{ id: "programDetail.addFirstDay", label: "Add first day", help: "Create the first training day in edit mode.", order: 220, when: ["empty"] }}
                    onClick={() => void addDay()}
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add first day
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    tour={{ id: "programDetail.editRoutine", label: "Edit routine", help: "Turn on edit mode to add your first day.", order: 230, when: ["empty"] }}
                    onClick={() => {
                      setEditing(true);
                      toast.info("Edit mode on — add your first day");
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Edit routine
                  </Button>
                )}
              </div>
            ) : null}

            {editing && !isSession ? (
              <button
                type="button"
                data-row
                className="flex h-12 w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
                {...tourAttrs({ id: "programDetail.addDay", label: "Add day", help: "Append another training day to the program.", order: 200, when: ["edit"] })}
                onClick={() => void addDay()}
              >
                <Plus className="h-4 w-4 flex-none" aria-hidden />
                Add day
              </button>
            ) : null}

            <div className="h-4 flex-none" aria-hidden />
          </>
        ) : null}

        {/* Part 5 date pickers: day scheduling (routines) + whole-session scheduling */}
        <DatePickerDialog
          open={scheduleDay != null}
          onOpenChange={(o) => !o && setScheduleDay(null)}
          title={`Schedule ${scheduleDay?.name ?? "day"}`}
          description={`Which date should ${routine?.name ?? "this routine"} · ${scheduleDay?.name ?? "this day"} land on?`}
          onSelect={(dayKey) => {
            const day = scheduleDay;
            setScheduleDay(null);
            if (day) scheduleRoutineDay(day, dayKey);
          }}
        />
        <DatePickerDialog
          open={sessionScheduleOpen}
          onOpenChange={setSessionScheduleOpen}
          title={`Schedule ${routine?.name ?? "session"}`}
          description="Pick the date for this session."
          onSelect={(dayKey) => scheduleSession(dayKey)}
        />
        {scheduleCreate.conflictDialog}
      </ScrollBody>

      {/* confirm-destructive: routine delete */}
      <AlertDialog open={deleteRoutineOpen} onOpenChange={(o) => !o && setDeleteRoutineOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
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
              Delete routine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* confirm-destructive: day delete */}
      <AlertDialog open={deleteDay != null} onOpenChange={(o) => !o && setDeleteDay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete day?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDay?.name}” and its {deleteDay?.exercises.length ?? 0} exercise
              {(deleteDay?.exercises.length ?? 0) === 1 ? "" : "s"} will be removed from this routine. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const day = deleteDay;
                setDeleteDay(null);
                if (day) void removeDay(day);
              }}
            >
              Delete day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
